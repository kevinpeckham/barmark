/**
 * The order a notation program plays a part's measures in: repeats with
 * their `times`, endings, and the jumps `<sound>` makes (`dacapo`,
 * `dalsegno`, `tocoda`, `fine`). After the jump every repeat plays once,
 * and a To Coda is taken once, forward only. It is the order the
 * written-out fallback writes bars in.
 */
import type { Losses } from "./losses.js";
import type { ReadMeasure } from "./read.js";

/** The most bars a played order holds: four times the measures, and at least 64. A longer one (a loop in a broken file, a huge `times`) isn't written out. */
const maxPlayed = (measures: number) => Math.max(4 * measures, 64);

const soundOf = (m: ReadMeasure | undefined, name: string): string | undefined =>
	m?.marks.find((k) => k.kind === "sound" && k.node.attrs[name] !== undefined)?.node.attrs[name];

/** The measure a jump goes to: the one whose `<sound>` names the sign, else the first carrying the sign itself. */
function findSign(ms: ReadMeasure[], sign: "segno" | "coda", value: string): number | undefined {
	const named = ms.findIndex((m) => soundOf(m, sign) === value);
	if (named >= 0) return named;
	const marked = ms.findIndex((m) => m.marks.some((k) => k.kind === sign));
	return marked >= 0 ? marked : undefined;
}

/** `findSign`, each sign looked for once: a walk may pass a jump many times. */
function signAt(
	ms: ReadMeasure[],
	sign: "segno" | "coda",
	value: string,
	w: Walk,
): number | undefined {
	const key = `${sign}\u0000${value}`;
	if (!w.signs.has(key)) w.signs.set(key, findSign(ms, sign, value));
	return w.signs.get(key);
}

/**
 * The walk through the measures: whether the jump is taken, the forward
 * repeats still open (innermost last), the bar after the last repeat
 * completed (where a backward repeat with no forward one goes back to),
 * each repeat's pass by its start, each ending's last measure by its
 * first, and the highest ending number of the endings each ending bar
 * belongs with.
 */
type Walk = {
	jumped: boolean;
	/** Whether the To Coda has been taken: only once. */
	coda: boolean;
	open: number[];
	after: number;
	pass: Map<number, number>;
	spans: Map<number, number>;
	endings: Map<number, number>;
	/** Where each sign is, once looked for. */
	signs: Map<string, number | undefined>;
};

/** Where the repeat being played starts. */
const startOf = (w: Walk) => w.open.at(-1) ?? w.after;

/** A repeat has played all its passes: play goes on from `next`. */
function complete(w: Walk, start: number, next: number): void {
	if (w.open.at(-1) === start) w.open.pop();
	w.pass.delete(start);
	w.after = next;
}

/** After the jump, To Coda (once, and only to a coda ahead) and Fine: where play goes, null to stop, undefined for neither. */
function afterJump(ms: ReadMeasure[], i: number, w: Walk): number | null | undefined {
	const m = ms[i] as ReadMeasure;
	const toCoda = soundOf(m, "tocoda");
	const coda = toCoda === undefined || w.coda ? undefined : signAt(ms, "coda", toCoda, w);
	if (coda !== undefined && coda > i) {
		w.coda = true;
		return coda;
	}
	return soundOf(m, "fine") !== undefined ? null : undefined;
}

/** Where a measure's jump goes: the start, or the segno; undefined for no jump, or no sign to go to. */
function jumpTarget(ms: ReadMeasure[], m: ReadMeasure, w: Walk): number | undefined {
	if (soundOf(m, "dacapo") !== undefined) return 0;
	const segno = soundOf(m, "dalsegno");
	return segno === undefined ? undefined : signAt(ms, "segno", segno, w);
}

/** The jump itself, taken once; after it, To Coda and Fine. */
function jump(ms: ReadMeasure[], i: number, w: Walk): number | null | undefined {
	if (w.jumped) return afterJump(ms, i, w);
	const to = jumpTarget(ms, ms[i] as ReadMeasure, w);
	if (to !== undefined) w.jumped = true;
	return to;
}

/** A backward repeat goes back until its passes are played (its `times`, or its endings' highest number); after the jump it plays once. */
function repeatFrom(m: ReadMeasure, i: number, w: Walk): number {
	if (!m.repeatEnd || w.jumped) return i + 1;
	const start = startOf(w);
	const pass = w.pass.get(start) ?? 1;
	if (pass < Math.max(m.repeatEnd.times, w.endings.get(i) ?? 0)) {
		w.pass.set(start, pass + 1);
		return start;
	}
	complete(w, start, i + 1);
	return i + 1;
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

/** The endings in a row from `i`, as [first, last] measures. */
function chain(spans: Map<number, number>, i: number): [number, number][] {
	const out: [number, number][] = [];
	for (let at = i; spans.has(at); at = (spans.get(at) as number) + 1)
		out.push([at, spans.get(at) as number]);
	return out;
}

/** The highest number among the endings in a row from `i`. */
const highest = (ms: ReadMeasure[], row: [number, number][]) =>
	Math.max(0, ...row.flatMap(([first]) => ms[first]?.ending?.numbers ?? []));

/** Each ending bar's highest ending number among the endings in its row: the passes its repeat plays. */
function endingPasses(ms: ReadMeasure[], spans: Map<number, number>): Map<number, number> {
	const out = new Map<number, number>();
	const lasts = new Set(spans.values());
	for (const first of spans.keys()) {
		if (lasts.has(first - 1)) continue;
		const row = chain(spans, first);
		const max = highest(ms, row);
		for (const [from, to] of row) for (let j = from; j <= to; j++) out.set(j, max);
	}
	return out;
}

/** The pass an ending at `i` is reached on; after the jump, its row's last, as `endingPasses` counted them. */
const passAt = (i: number, start: number, w: Walk) =>
	w.jumped ? (w.endings.get(i) ?? 0) : (w.pass.get(start) ?? 1);

/** Where play goes from measure `i`: on to it, or past an ending this pass doesn't take. A forward repeat opens a repeat; the last ending taken completes it. */
function landing(ms: ReadMeasure[], i: number, w: Walk): number {
	if (ms[i]?.repeatStart && w.open.at(-1) !== i) w.open.push(i);
	const last = w.spans.get(i);
	if (last === undefined) return i;
	const start = startOf(w);
	const pass = passAt(i, start, w);
	if (!ms[i]?.ending?.numbers.includes(pass)) return landing(ms, last + 1, w);
	if (!ms.slice(i, last + 1).some((m) => m.repeatEnd)) complete(w, start, last + 1);
	return i;
}

const TOO_LONG = (n: number) =>
	`play order runs past ${n} bars; bars written once each, in written order`;

/** The indexes of `measures` in the order they play; null, with a loss, when that runs past the cap. */
export function playedOrder(measures: ReadMeasure[], losses?: Losses): number[] | null {
	const out: number[] = [];
	const spans = endingSpans(measures);
	const w: Walk = {
		jumped: false,
		coda: false,
		open: [],
		after: 0,
		pass: new Map(),
		spans,
		endings: endingPasses(measures, spans),
		signs: new Map(),
	};
	const cap = maxPlayed(measures.length);
	let i: number | null = 0;
	while (i !== null && i < measures.length) {
		if (out.length === cap) {
			losses?.note({ severity: "warning", message: TOO_LONG(cap) });
			return null;
		}
		i = landing(measures, i, w);
		const m = measures[i];
		if (!m) break;
		out.push(i);
		const to = jump(measures, i, w);
		i = to === undefined ? repeatFrom(m, i, w) : to;
	}
	return out;
}
