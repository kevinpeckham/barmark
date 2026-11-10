/**
 * The engraver equivalence gate's judgement, kept pure so it is tested
 * (packages/engraver/tests/equivalence.test.ts): what fails the gate, and
 * the timings it reports without gating.
 */

/** One engraving of one chart at one width, as scripts/engraver-engrave.mjs records it. */
export type Engraving = {
	name: string;
	width: 375 | 1000;
	pages: number;
	bytes: number;
	ms: number;
};

/** One engraver's run over the corpus: its getVersion(), its instantiate time and its engravings. */
export type Run = { version: string; instantiateMs: number; engravings: Engraving[] };

/** Fewer engravings than this is an empty pass, not a pass. */
const MIN_ENGRAVINGS = 60;
/** Q1: the build ships -Os instead of -Oz if its slowest width-375 engraving passes this. */
const Q1_MS = 500;
const CONTEXT = 80;

/** The first offset where `a` and `b` differ, with 80 characters of each from 40 before it; null if they are equal. */
export function firstDifference(
	a: string,
	b: string,
): { offset: number; stock: string; lite: string } | null {
	if (a === b) return null;
	let offset = 0;
	while (offset < a.length && offset < b.length && a[offset] === b[offset]) offset++;
	const start = Math.max(0, offset - CONTEXT / 2);
	return { offset, stock: a.slice(start, start + CONTEXT), lite: b.slice(start, start + CONTEXT) };
}

const keyOf = (e: Engraving) => `${e.name}\u0000${e.width}`;
const label = (e: Engraving) => `${e.name} at ${e.width}`;

/** What is wrong with one chart at one width, engraved by both. */
function pairProblems(
	s: Engraving,
	l: Engraving,
	svgs: (e: Engraving, which: "stock" | "lite") => string,
): string[] {
	const stockSvg = svgs(s, "stock");
	const liteSvg = svgs(l, "lite");
	const empty = [
		...(s.bytes === 0 || stockSvg.length === 0 ? ["stock"] : []),
		...(l.bytes === 0 || liteSvg.length === 0 ? ["lite"] : []),
	];
	if (empty.length > 0) return [`${label(s)}: empty in ${empty.join(" and ")}`];
	const problems: string[] = [];
	if (s.pages !== l.pages)
		problems.push(`${label(s)}: ${s.pages} pages in stock, ${l.pages} in lite`);
	const d = firstDifference(stockSvg, liteSvg);
	if (d)
		problems.push(
			`${label(s)}: SVG differs at offset ${d.offset}\n  stock: ${JSON.stringify(d.stock)}\n  lite:  ${JSON.stringify(d.lite)}`,
		);
	return problems;
}

/**
 * Everything that fails the gate: a different getVersion(), fewer than 60
 * engravings, no engraving of more than one page (so page breaks go
 * untested), a chart one run lacks, an empty engraving, or a page count or
 * SVG that differs by a byte. Timings never fail it.
 */
export function gateProblems(
	stock: Run,
	lite: Run,
	svgs: (e: Engraving, which: "stock" | "lite") => string,
): string[] {
	const problems: string[] = [];
	if (stock.version !== lite.version)
		problems.push(`getVersion() differs: stock ${stock.version}, lite ${lite.version}`);
	const count = Math.min(stock.engravings.length, lite.engravings.length);
	if (count < MIN_ENGRAVINGS)
		problems.push(`only ${count} engravings, under ${MIN_ENGRAVINGS}: an empty pass is not a pass`);
	if (!stock.engravings.some((e) => e.pages > 1))
		problems.push(
			"no engraving has more than one page: the long chart no longer covers page breaks",
		);
	const lites = new Map(lite.engravings.map((e) => [keyOf(e), e]));
	for (const s of stock.engravings) {
		const l = lites.get(keyOf(s));
		lites.delete(keyOf(s));
		problems.push(...(l ? pairProblems(s, l, svgs) : [`${label(s)}: only in stock`]));
	}
	for (const l of lites.values()) problems.push(`${label(l)}: only in lite`);
	return problems;
}

const ms = (n: number) => `${Math.round(n)} ms`;

/** The synthetic stress chart, left out of the "real chart" line. */
const LONG = "long.chart.md";

/** The slowest engraving at width 375 among those `keep` accepts, or none. */
const slowest375 = (
	run: Run,
	keep: (e: Engraving) => boolean = () => true,
): Engraving | undefined =>
	run.engravings
		.filter((e) => e.width === 375 && keep(e))
		.reduce<Engraving | undefined>((a, e) => (a && a.ms >= e.ms ? a : e), undefined);

const totalMs = (run: Run) => run.engravings.reduce((t, e) => t + e.ms, 0);

function line(which: string, run: Run): string {
	const slow = slowest375(run);
	return `${which}: ${run.version}, instantiate ${ms(run.instantiateMs)}, engrave ${ms(totalMs(run))} in total over ${run.engravings.length}, slowest at 375: ${slow ? `${slow.name}, ${ms(slow.ms)}` : "none"}`;
}

/** Lite's slowest real chart at 375 (the long chart left out), with stock's time for the same engraving. */
function realChartLine(stock: Run, lite: Run): string {
	const slow = slowest375(lite, (e) => e.name !== LONG);
	if (!slow) return `slowest real chart at 375 (without ${LONG}): none`;
	const same = stock.engravings.find((e) => e.name === slow.name && e.width === 375);
	return `slowest real chart at 375 (without ${LONG}): ${slow.name}, stock ${same ? ms(same.ms) : "none"}, lite ${ms(slow.ms)}`;
}

/**
 * Each run's instantiate time, total engrave time and slowest width-375
 * engraving; lite's slowest real chart at 375 beside stock's time for it;
 * lite's total engrave time over stock's; and a warning (not a failure)
 * when the lite build's slowest passes Q1's 500 ms.
 */
export function summary(stock: Run, lite: Run): string {
	const ratio = totalMs(stock) > 0 ? (totalMs(lite) / totalMs(stock)).toFixed(2) : "n/a";
	const lines = [
		line("stock", stock),
		line("lite ", lite),
		realChartLine(stock, lite),
		`engrave time, lite over stock: ${ratio}× (${lite.engravings.length} engravings)`,
	];
	const slow = slowest375(lite);
	if (slow && slow.ms > Q1_MS)
		lines.push(`⚠ over ${Q1_MS} ms: Q1 says ship -Os (${slow.name}, ${ms(slow.ms)})`);
	return lines.join("\n");
}
