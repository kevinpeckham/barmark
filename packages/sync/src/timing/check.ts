import { beatsOf, type ChartParse, parseChart, printParsed } from "barmark";
import { fnv1a64 } from "./hash.js";
import type { TimingDiagnostic, TimingMap } from "./types.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBarNumber = (v: unknown): v is number =>
	typeof v === "number" && Number.isInteger(v) && v >= 1;

/** Collects the diagnostics of one check. */
class Report {
	readonly diagnostics: TimingDiagnostic[] = [];
	error(path: string, message: string, code?: TimingDiagnostic["code"]) {
		this.diagnostics.push({ severity: "error", ...(code ? { code } : {}), message, path });
	}
	warning(path: string, message: string) {
		this.diagnostics.push({ severity: "warning", message, path });
	}
	get failed() {
		return this.diagnostics.some((d) => d.severity === "error");
	}
}

const optional = (v: unknown, ok: (v: unknown) => boolean) => v === undefined || ok(v);
const isString = (v: unknown) => typeof v === "string";
const isDuration = (v: unknown) => isNum(v) && v >= 0;
const isSecondsList = (v: unknown) => Array.isArray(v) && v.every(isNum);

/** Reports `message` at `path` unless `ok`; returns `ok`. */
function expect(r: Report, ok: boolean, path: string, message: string): boolean {
	if (!ok) r.error(path, message);
	return ok;
}

function checkRecording(rec: unknown, r: Report) {
	if (rec === undefined) return;
	if (!expect(r, isObj(rec), "recording", "recording must be an object")) return;
	const o = rec as Obj;
	expect(r, optional(o.id, isString), "recording.id", "recording.id must be a string");
	expect(
		r,
		optional(o.duration, isDuration),
		"recording.duration",
		"recording.duration must be a non-negative number",
	);
}

/** The chart field's checks; its `bars` if that is usable. */
function checkChartField(c: unknown, r: Report): number | null {
	if (!expect(r, isObj(c), "chart", "chart must be an object")) return null;
	const { bars, hash, ref } = c as Obj;
	expect(r, isBarNumber(bars), "chart.bars", "chart.bars must be a whole number, 1 or more");
	expect(
		r,
		typeof hash === "string" && /^[0-9a-f]{16}$/.test(hash),
		"chart.hash",
		"chart.hash must be 16 lowercase hex digits",
	);
	expect(r, optional(ref, isString), "chart.ref", "chart.ref must be a string");
	return isBarNumber(bars) ? bars : null;
}

function checkHeader(v: Obj, r: Report): number | null {
	expect(r, v.format === "barmark-timing", "format", `format must be "barmark-timing"`);
	expect(
		r,
		v.version === 1,
		"version",
		`version ${JSON.stringify(v.version)} is not one this reader knows (1)`,
	);
	expect(r, optional(v.source, isString), "source", "source must be a string");
	checkRecording(v.recording, r);
	expect(r, isNum(v.end), "end", "end must be a number of seconds");
	return checkChartField(v.chart, r);
}

/** An entry's shape; false if its numbers can't be compared with its neighbours'. */
function checkEntryShape(e: unknown, path: string, chartBars: number | null, r: Report): boolean {
	if (!expect(r, isObj(e), path, "an entry must be an object")) return false;
	const o = e as Obj;
	expect(
		r,
		isBarNumber(o.bar) && (chartBars === null || o.bar <= chartBars),
		`${path}.bar`,
		`bar must be a whole number from 1 to ${chartBars ?? "chart.bars"}`,
	);
	const start = expect(r, isNum(o.start), `${path}.start`, "start must be a number of seconds");
	const end = expect(r, optional(o.end, isNum), `${path}.end`, "end must be a number of seconds");
	const beats = expect(
		r,
		optional(o.beats, isSecondsList),
		`${path}.beats`,
		"beats must be a list of numbers of seconds",
	);
	return start && end && beats;
}

/** One well-formed entry against the next start (or the map's end). */
function checkEntryOrder(
	e: Obj,
	i: number,
	prevStart: number | null,
	stop: number | null,
	r: Report,
) {
	const start = e.start as number;
	if (prevStart !== null && start <= prevStart) r.error(`bars[${i}].start`, "starts must increase");
	let entryStop = stop;
	if (typeof e.end === "number") {
		if (e.end <= start) r.error(`bars[${i}].end`, "an entry's end must be after its start");
		else if (stop !== null && e.end > stop)
			r.error(`bars[${i}].end`, "an entry's end must be no later than the next start");
		entryStop = e.end;
	}
	if (Array.isArray(e.beats)) checkBeats(start, e.beats as number[], entryStop, i, r);
}

function checkOrder(bars: Obj[], valid: boolean[], end: number | null, r: Report) {
	bars.forEach((e, i) => {
		const prev = bars[i - 1];
		const next = bars[i + 1];
		if (!valid[i]) return;
		const prevStart = prev && valid[i - 1] ? (prev.start as number) : null;
		const stop = next && valid[i + 1] ? (next.start as number) : end;
		checkEntryOrder(e, i, prevStart, stop, r);
	});
	const last = bars[bars.length - 1];
	if (end !== null && last && valid[bars.length - 1] && end <= (last.start as number))
		r.error("end", "end must be after the last start");
}

function checkBeats(start: number, beats: number[], stop: number | null, i: number, r: Report) {
	const path = `bars[${i}].beats`;
	if (beats.some((b, k) => b <= (k === 0 ? start : (beats[k - 1] as number))))
		r.error(path, "beats must increase and come after start");
	else if (stop !== null && beats.some((b) => b >= stop))
		r.error(path, "beats must come before the entry ends");
}

function checkAgainstChart(map: TimingMap, text: string, given: ChartParse | undefined, r: Report) {
	const parse = given ?? parseChart(text);
	if (fnv1a64(printParsed(text, parse)) !== map.chart.hash)
		r.error("chart.hash", "the chart has changed since this map was made", "chart-hash-mismatch");
	if (map.chart.bars !== parse.bars.length)
		r.error(
			"chart.bars",
			`chart.bars is ${map.chart.bars}, but the chart plays ${parse.bars.length} bars`,
		);
	map.bars.forEach((e, i) => {
		const played = parse.bars[e.bar - 1];
		if (!e.beats || !played) return;
		const want = beatsOf(played.meter) - 1;
		if (e.beats.length !== want)
			r.error(
				`bars[${i}].beats`,
				`bar ${e.bar} is ${played.meter.n}/${played.meter.d}: expected ${want} beats after the start, got ${e.beats.length}`,
			);
	});
	const named = new Set(map.bars.map((e) => e.bar));
	const missing = parse.bars.map((b) => b.index).filter((n) => !named.has(n));
	if (missing.length > 0)
		r.warning(
			"bars",
			`the map never names bar${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`,
		);
}

/**
 * Shape and rules of a timing map (README, "The timing map"); with `chart`,
 * also its hash, bar range, beat counts and coverage. Never throws. `map` is
 * `value` itself, typed, whenever there is no error; warnings don't null it.
 */
export function checkTimingMap(
	value: unknown,
	chart?: { text: string; parse?: ChartParse },
): { map: TimingMap | null; diagnostics: TimingDiagnostic[] } {
	const r = new Report();
	if (!isObj(value)) {
		r.error("", "a timing map must be an object");
		return { map: null, diagnostics: r.diagnostics };
	}
	const chartBars = checkHeader(value, r);
	if (!Array.isArray(value.bars)) r.error("bars", "bars must be a list");
	else {
		const valid = value.bars.map((e, i) => checkEntryShape(e, `bars[${i}]`, chartBars, r));
		checkOrder(value.bars as Obj[], valid, isNum(value.end) ? value.end : null, r);
	}
	if (!r.failed && chart)
		checkAgainstChart(value as unknown as TimingMap, chart.text, chart.parse, r);
	return { map: r.failed ? null : (value as unknown as TimingMap), diagnostics: r.diagnostics };
}
