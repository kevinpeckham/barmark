/**
 * The import's diagnostics. Each problem (a code, a track or none, and a
 * message) is reported once; a repeat adds to its count and, while there
 * are fewer than five, its bars, both stated in the message: "? written
 * (7 times; bars 3, 1, 4, 7, 9 and more)", or "(2 times; bar 4)". So a
 * message never carries a per-event value read from the file (a hostile
 * file would make one diagnostic per value): bars and tracks go in
 * `where`. A message raised once per track or once per import may name
 * tracks (a list of them is capped). The reader (`smf/read.ts`) reports
 * through it too.
 *
 * Bars are given as the grid numbers them (1 for its first bar); once the
 * grid is known to open with a pickup, `writtenBars` makes them the chart's
 * (the pickup is bar 0, the first full bar 1), those raised so far too.
 */
import type { MidiImportCode, MidiImportDiagnostic } from "./types.js";

/** Where a diagnostic points: a 1-based track chunk, the chart's bar: a grid number until `writtenBars` runs, then its written number. */
export type Where = { track?: number | undefined; bar?: number | undefined };

export type Report = {
	add(
		code: MidiImportCode,
		severity: MidiImportDiagnostic["severity"],
		message: string,
		where?: Where,
	): void;
	/** From now on, and for those raised so far, bars count from the chart's pickup as bar 0. */
	writtenBars(): void;
	/** The diagnostics, in the order first raised. */
	readonly list: MidiImportDiagnostic[];
};

const FIRST_BARS = 5;

/** One problem: its diagnostic, its first message, how often it came and its first bars. */
type Entry = {
	d: MidiImportDiagnostic;
	message: string;
	count: number;
	bars: number[];
	more: boolean;
};

/** "1", "1 and 2", "1, 2 and 3". */
export function andList(items: string[]): string {
	return items.length < 2
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function messageOf(e: Entry): string {
	if (e.count === 1) return e.message;
	const bars = e.bars.map(String);
	if (e.more) bars.push("more");
	const word = bars.length === 1 ? "bar" : "bars";
	return `${e.message} (${e.count} times${bars.length > 0 ? `; ${word} ${andList(bars)}` : ""})`;
}

function addBar(e: Entry, bar: number | undefined) {
	if (bar === undefined || e.bars.includes(bar)) return;
	e.d.bar ??= bar;
	if (e.bars.length < FIRST_BARS) e.bars.push(bar);
	else e.more = true;
}

export function createReport(): Report {
	const list: MidiImportDiagnostic[] = [];
	const entries = new Map<string, Entry>();
	let shift = 0;
	return {
		list,
		writtenBars() {
			if (shift > 0) return;
			shift = 1;
			for (const e of entries.values()) {
				e.bars = e.bars.map((b) => b - 1);
				if (e.d.bar !== undefined) e.d.bar -= 1;
				e.d.message = messageOf(e);
			}
		},
		add(code, severity, message, { track, bar } = {}) {
			const key = `${code} ${track ?? ""} ${message}`;
			let e = entries.get(key);
			if (e === undefined) {
				const d: MidiImportDiagnostic = { severity, code, message };
				if (track !== undefined) d.track = track;
				e = { d, message, count: 0, bars: [], more: false };
				entries.set(key, e);
				list.push(d);
			}
			e.count++;
			addBar(e, bar === undefined ? bar : bar - shift);
			e.d.message = messageOf(e);
		},
	};
}
