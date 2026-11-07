/**
 * Random small charts with one jump (D.C. or D.S., al Fine, al Coda or
 * neither) among repeats, endings, `x N` on bar lines and headings,
 * replays, elisions, text lines and several parts: the round trip's
 * property test reads them. Seeded, so every run reads the same charts.
 */
import { parseChart } from "barmark";

/** A seeded generator: the same seed, the same chart. */
function generator(seed: number) {
	let state = seed;
	const rnd = () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
	const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
	const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
	return { rnd, pick, int };
}

type Gen = ReturnType<typeof generator>;

const CHORDS = ["C", "Dm", "Em", "F", "G7", "Am", "Bb", "E7"];
/** The second part's chord for the first's, so the parts never agree (two that agree import as one). */
const OTHER: Record<string, string> = {
	C: "A",
	Dm: "B",
	Em: "Cm",
	F: "D",
	G7: "Eb",
	Am: "F#m",
	Bb: "Gm",
	E7: "Ab",
};
const NAMES = ["Intro", "Verse", "Chorus", "Bridge"];
const JUMPS = ["D.C.", "D.C. al Fine", "D.C. al Coda", "D.S.", "D.S. al Fine", "D.S. al Coda"];
const TEXTS = ["play softly", "### hits", "watch the bass", "Fine is on the cue"];

/** A written bar: its chord (null for directions alone, on a bar line of their own), and the directions written before and after it. */
type Bar = { chord: string | null; before: string[]; after: string[] };
/** One written bar line: its bars, and the marks around them. */
type Row = { bars: Bar[]; open: boolean; close: string | null; tail: string; ending: string };
/** A section: its heading, its rows, and a text line after a row (by row index, -1 before the first). */
type Section = { heading: string; rows: Row[]; text: Map<number, string> };

const row = (g: Gen): Row => ({
	bars: Array.from({ length: g.int(1, 3) }, () => ({
		chord: g.rnd() < 0.15 ? "%" : g.pick(CHORDS),
		before: [],
		after: [],
	})),
	open: false,
	close: null,
	tail: "",
	ending: "",
});

/** A `|: … :|` over the rows: closed with `:|`, `:| x3`, or with two endings after it. */
function bracket(g: Gen, out: Row[]): void {
	(out[0] as Row).open = true;
	const last = out[out.length - 1] as Row;
	if (g.rnd() < 0.4) {
		last.close = ":|";
		out.push({ ...row(g), ending: "|1 ", close: ":|" }, { ...row(g), ending: "|2 " });
	} else last.close = g.rnd() < 0.3 ? ":| x3" : ":|";
	// A line's x N inside the repeat: nested.
	if (out.length > 1 && !(out[0] as Row).close && g.rnd() < 0.2) (out[0] as Row).tail = " x2";
}

/** Rows for a written section: plain lines, a line's `x N`, a `|: … :|` with or without endings. */
function rows(g: Gen): Row[] {
	const out = Array.from({ length: g.int(1, 3) }, () => row(g));
	const r = g.rnd();
	if (r < 0.25) (out[g.int(0, out.length - 1)] as Row).tail = ` x${g.pick([2, 3])}`;
	else if (r < 0.6) bracket(g, out);
	return out;
}

function sections(g: Gen): Section[] {
	const out: Section[] = [];
	const n = g.int(1, 4);
	for (let i = 0; i < n; i++) {
		const written = out
			.filter((s) => s.rows.length > 0)
			.map((s) => s.heading.split(" ")[0] as string);
		const text = new Map<number, string>();
		if (g.rnd() < 0.3) text.set(g.pick([-1, 0, 1]), g.pick(TEXTS));
		if (written.length && g.rnd() < 0.3) {
			const heading = g.pick(written) + g.pick(["", "", " x2", " ->", " x2 ->"]);
			out.push({ heading, rows: [], text });
		} else
			out.push({
				heading: (NAMES[i] as string) + (g.rnd() < 0.2 ? " x2" : ""),
				rows: rows(g),
				text,
			});
	}
	return out;
}

/** Every written bar, in written order. */
const barsOf = (ss: Section[]) => ss.flatMap((s) => s.rows.flatMap((r) => r.bars));

/** One jump, with the Segno, Fine, To Coda and Coda it needs, at random bars in order. */
function jump(g: Gen, ss: Section[]): void {
	const kind = g.pick(JUMPS);
	const body = barsOf(ss);
	if (kind.endsWith("al Coda")) {
		const coda = row(g);
		(coda.bars[0] as Bar).before.push("Coda");
		// Text after the coda: text from bars no pass plays must stay before it.
		const text = new Map(g.rnd() < 0.5 ? [[0, "### end"] as const] : []);
		ss.push({ heading: "Coda", rows: [coda], text });
	}
	if (body.length === 0) return;
	const at = g.int(Math.floor(body.length / 2), body.length - 1);
	const earlier = () => body[g.int(0, at)] as Bar;
	if (kind.endsWith("al Coda")) earlier().after.push("To Coda");
	if (kind.endsWith("al Fine")) earlier().after.push("Fine");
	if (kind.startsWith("D.S.")) earlier().before.push("Segno");
	if (g.rnd() < 0.6) (body[at] as Bar).after.push(kind);
	else alone(ss, body[at] as Bar, kind);
}

/** The jump on a bar line of its own, after the line holding `bar`: after any repeat that line closes. */
function alone(ss: Section[], bar: Bar, kind: string): void {
	for (const s of ss) {
		const j = s.rows.findIndex((r) => r.bars.includes(bar));
		if (j < 0) continue;
		const lone: Row = {
			bars: [{ chord: null, before: [], after: [kind] }],
			open: false,
			close: null,
			tail: "",
			ending: "",
		};
		s.rows.splice(j + 1, 0, lone);
	}
}

const cells = (b: Bar, chord: (c: string) => string) => [
	...b.before,
	...(b.chord === null ? [] : [chord(b.chord)]),
	...b.after,
];

const line = (r: Row, chord: (c: string) => string) => {
	const open = r.ending || (r.open ? "|: " : "| ");
	const close = r.close ? ` ${r.close}` : " |";
	return `${open}${r.bars.flatMap((b) => cells(b, chord)).join(" | ")}${close}${r.tail}`;
};

const same = (c: string) => c;
const other = (c: string) => OTHER[c] ?? c;

/** The chart's text: one part or two, each system's lines one under the other. */
function write(ss: Section[], parts: number): string {
	const head = parts === 2 ? "part: A = Alpha\npart: B = Beta\n\n" : "";
	const lines = ss.map((s) => {
		const out = [`## ${s.heading}`];
		if (s.text.has(-1)) out.push(s.text.get(-1) as string);
		s.rows.forEach((r, j) => {
			if (parts === 2) out.push(`A ${line(r, same)}`, `B ${line(r, other)}`);
			else out.push(line(r, same));
			if (s.text.has(j)) out.push(s.text.get(j) as string);
		});
		return out.join("\n");
	});
	return `${head}${lines.join("\n\n")}\n`;
}

/** The chart a seed makes, or null when it doesn't parse cleanly. */
export function jumpChart(seed: number): string | null {
	const g = generator(seed);
	const ss = sections(g);
	if (g.rnd() < 0.85) jump(g, ss);
	// A fermata cell at the chart's end: a final chord that rings.
	const last = barsOf(ss).at(-1);
	if (last && g.rnd() < 0.2) last.after.push("...");
	const text = write(ss, g.rnd() < 0.3 ? 2 : 1);
	const p = parseChart(text);
	return p.bars.length && !p.diagnostics.some((d) => d.severity === "error") ? text : null;
}
