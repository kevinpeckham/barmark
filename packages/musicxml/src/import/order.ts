/**
 * The order a notation program plays a part's measures in: repeats with
 * their `times`, endings, and the jumps `<sound>` makes (`dacapo`,
 * `dalsegno`, `tocoda`, `fine`). After the jump every repeat plays once.
 * It is the order the written-out fallback writes bars in.
 */
import type { ReadMeasure } from "./read.js";

/** The most measures a played order holds: a loop in a broken file stops here. */
const MAX_PLAYED = 10000;

const soundOf = (m: ReadMeasure | undefined, name: string): string | undefined =>
	m?.marks.find((k) => k.kind === "sound" && k.node.attrs[name] !== undefined)?.node.attrs[name];

/** The measure a jump goes to: the one whose `<sound>` names the sign, else the first carrying the sign itself. */
function signAt(ms: ReadMeasure[], sign: "segno" | "coda", value: string): number | undefined {
	const named = ms.findIndex((m) => soundOf(m, sign) === value);
	if (named >= 0) return named;
	const marked = ms.findIndex((m) => m.marks.some((k) => k.kind === sign));
	return marked >= 0 ? marked : undefined;
}

/** The walk through the measures: whether the jump is taken, the repeat's start, each repeat's pass, each ending's last measure. */
type Walk = {
	jumped: boolean;
	from: number;
	pass: Map<number, number>;
	spans: Map<number, number>;
};

/** After the jump, To Coda and Fine: where play goes, null to stop, undefined for neither. */
function afterJump(ms: ReadMeasure[], m: ReadMeasure): number | null | undefined {
	const toCoda = soundOf(m, "tocoda");
	if (toCoda !== undefined) return signAt(ms, "coda", toCoda);
	return soundOf(m, "fine") !== undefined ? null : undefined;
}

/** Where a measure's jump goes: the start, or the segno; undefined for no jump, or no sign to go to. */
function jumpTarget(ms: ReadMeasure[], m: ReadMeasure): number | undefined {
	if (soundOf(m, "dacapo") !== undefined) return 0;
	const segno = soundOf(m, "dalsegno");
	return segno === undefined ? undefined : signAt(ms, "segno", segno);
}

/** The jump itself, taken once; after it, To Coda and Fine. */
function jump(ms: ReadMeasure[], m: ReadMeasure, w: Walk): number | null | undefined {
	if (w.jumped) return afterJump(ms, m);
	const to = jumpTarget(ms, m);
	if (to !== undefined) w.jumped = true;
	return to;
}

/** A backward repeat goes back until its passes are played; after the jump it plays once. */
function repeatFrom(m: ReadMeasure, i: number, w: Walk): number {
	if (!m.repeatEnd || w.jumped) return i + 1;
	const pass = w.pass.get(w.from) ?? 1;
	const again = pass < m.repeatEnd.times;
	if (again) w.pass.set(w.from, pass + 1);
	else w.pass.delete(w.from);
	return again ? w.from : i + 1;
}

/** Each ending's last measure, by its first; an ending never stopped runs to the last measure. */
function endingSpans(ms: ReadMeasure[]): Map<number, number> {
	const spans = new Map<number, number>();
	let open: number | null = null;
	ms.forEach((m, i) => {
		if (m.ending?.start && open === null) open = i;
		if (open !== null && (m.ending?.stop || m.ending?.discontinue)) {
			spans.set(open, i);
			open = null;
		}
	});
	if (open !== null) spans.set(open, ms.length - 1);
	return spans;
}

/** The highest pass of the endings in a row from `i`: the one taken after the jump. */
function lastPass(ms: ReadMeasure[], i: number, w: Walk): number {
	const numbers: number[] = [];
	for (let at = i; w.spans.has(at); at = (w.spans.get(at) as number) + 1)
		numbers.push(...(ms[at]?.ending?.numbers ?? []));
	return Math.max(0, ...numbers);
}

/** Where play goes from measure `i`: on to it, or past an ending this pass doesn't take. A forward repeat is the repeat's start. */
function landing(ms: ReadMeasure[], i: number, w: Walk): number {
	if (ms[i]?.repeatStart) w.from = i;
	const last = w.spans.get(i);
	if (last === undefined) return i;
	const pass = w.jumped ? lastPass(ms, i, w) : (w.pass.get(w.from) ?? 1);
	return ms[i]?.ending?.numbers.includes(pass) ? i : landing(ms, last + 1, w);
}

/** The indexes of `measures` in the order they play. */
export function playedOrder(measures: ReadMeasure[]): number[] {
	const out: number[] = [];
	const w: Walk = { jumped: false, from: 0, pass: new Map(), spans: endingSpans(measures) };
	let i: number | null = 0;
	while (i !== null && out.length < MAX_PLAYED) {
		i = landing(measures, i, w);
		const m = measures[i];
		if (!m) break;
		out.push(i);
		const to = jump(measures, m, w);
		i = to === undefined ? repeatFrom(m, i, w) : to;
	}
	return out;
}
