import type { Line, Repeat } from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;
type Report = (line: number, message: string, token: string) => void;

export type Entry = { line: Line; repeat: Repeat };
/** One ending: the passes it plays on and its bar line. */
export type Ending = { passes: number[]; entry: Entry };
/** A line, or a `|: … :|` repeat; one with endings plays `repeat` passes, each taking its ending. */
export type Item =
	| ({ kind: "line" } & Entry)
	| { kind: "bracket"; line: number; entries: Entry[]; repeat: Repeat; endings: Ending[] };

/** A repeat whose endings have begun, with the text lines met among them. */
type Endings = { line: number; entries: Entry[]; endings: BarsLine[]; between: Entry[] };
/** Pairing so far: the items made, a `|:` waiting for its `:|`, and endings being collected. */
type State = {
	items: Item[];
	open: { line: number; entries: Entry[] } | null;
	endings: Endings | null;
};

const passesToken = (b: BarsLine) => `|${(b.ending ?? []).join(",")}`;
const asLine = (line: Line): Item => ({ kind: "line", line, repeat: null });
const highestPass = (endings: BarsLine[]) => Math.max(...endings.flatMap((b) => b.ending ?? []));

/** Every pass from 1 to the highest has exactly one ending, and the highest is at least 2. */
function passProblems(endings: BarsLine[], last: BarsLine): [BarsLine, string][] {
	const highest = highestPass(endings);
	if (highest < 2) return [[last, "a repeat with endings plays at least two passes"]];
	const problems: [BarsLine, string][] = [];
	for (let p = 1; p < highest + 1; p++) {
		const n = endings.filter((b) => b.ending?.includes(p)).length;
		if (n !== 1) problems.push([last, `pass ${p} has ${n ? "two endings" : "no ending"}`]);
	}
	if (!last.ending?.includes(highest))
		problems.push([last, `the last ending must be the one for pass ${highest}`]);
	return problems;
}

/** Every ending but the last goes back with `:|`; the last plays on. */
function closeProblems(endings: BarsLine[], last: BarsLine): [BarsLine, string][] {
	return endings.flatMap((b): [BarsLine, string][] => {
		if (b === last)
			return b.closes ? [[b, "the last ending plays on, so it doesn't close with :|"]] : [];
		return b.closes ? [] : [[b, "an ending before the last goes back with :|"]];
	});
}

/** A repeat with its endings, or, if they have problems, each line played once. */
function closeEndings(e: Endings, error: Report): Item[] {
	const last = e.endings.at(-1);
	if (!last) return [];
	const problems = [...passProblems(e.endings, last), ...closeProblems(e.endings, last)];
	for (const [b, message] of problems) error(b.line, message, passesToken(b));
	const between = e.between.map((x) => asLine(x.line));
	if (problems.length)
		return [...e.entries.map((x) => asLine(x.line)), ...e.endings.map(asLine), ...between];
	const endings = e.endings.map((b) => ({
		passes: b.ending ?? [],
		entry: { line: b, repeat: null },
	}));
	const repeat = highestPass(e.endings);
	return [{ kind: "bracket", line: e.line, entries: e.entries, repeat, endings }, ...between];
}

/** An ending line starts the endings of the open repeat, or continues them. */
function takeEnding(st: State, bars: BarsLine, error: Report): void {
	if (bars.repeat !== null)
		error(bars.line, "x N on an ending: the endings give the count", passesToken(bars));
	if (st.open) st.endings = { ...st.open, endings: [bars], between: [] };
	else if (st.endings) st.endings.endings.push(bars);
	else {
		error(bars.line, "an ending follows the bars of a |: … :| repeat", passesToken(bars));
		st.items.push(asLine(bars));
	}
	st.open = null;
}

/** `|:` opens a repeat, unless one is open already. */
function openRepeat(st: State, bars: BarsLine, error: Report): void {
	if (st.open) error(bars.line, "|: inside another |:", "|:");
	else st.open = { line: bars.line, entries: [] };
}

/** `:|` closes the open repeat; with none open it is an error, and its line plays once. */
function closeRepeat(st: State, bars: BarsLine, error: Report): void {
	if (!st.open) {
		error(bars.line, ":| has no |: before it in this section", ":|");
		st.items.push(asLine(bars));
		return;
	}
	const { line, entries } = st.open;
	entries.push({ line: bars, repeat: null });
	st.items.push({ kind: "bracket", line, entries, repeat: bars.repeat ?? 2, endings: [] });
	st.open = null;
}

/** Any other line: it opens or closes a repeat, or belongs to the open one, or stands alone. */
function takeLine(st: State, l: Line, error: Report): void {
	if (l.kind === "bars" && l.opens) openRepeat(st, l, error);
	if (l.kind === "bars" && l.closes) closeRepeat(st, l, error);
	else addEntry(st, { line: l, repeat: l.kind === "bars" ? l.repeat : null });
}

/** A line inside the open repeat belongs to it; any other stands alone. */
function addEntry(st: State, entry: Entry): void {
	if (st.open) st.open.entries.push(entry);
	else st.items.push({ kind: "line", ...entry });
}

/** Lines that may sit between endings (grammar 5.1): they mean nothing to the timeline. */
const BETWEEN_ENDINGS = new Set<Line["kind"]>(["text", "credit", "lyrics", "break"]);

/**
 * Pair `|:` and `:|` within one section's lines, with the endings that
 * follow a repeat (grammar 5.1). Problems are reported, and what cannot
 * pair plays once.
 */
export function pairRepeats(lines: Line[], error: Report): Item[] {
	const st: State = { items: [], open: null, endings: null };
	const finish = () => {
		if (st.endings) st.items.push(...closeEndings(st.endings, error));
		st.endings = null;
	};
	for (const l of lines) {
		if (l.kind === "bars" && l.ending) takeEnding(st, l, error);
		else if (st.endings && BETWEEN_ENDINGS.has(l.kind))
			st.endings.between.push({ line: l, repeat: null });
		else {
			finish();
			takeLine(st, l, error);
		}
	}
	finish();
	if (st.open) {
		error(st.open.line, "|: is never closed in this section", "|:");
		st.items.push(...st.open.entries.map((e): Item => ({ kind: "line", ...e })));
	}
	return st.items;
}
