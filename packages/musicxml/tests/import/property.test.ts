/**
 * Random multi-part scores, from the whole-branch review's fuzzer: chords,
 * slashes, melodies, rests, voices and staves, pickups, meter and divisions
 * changes, repeats, endings, jumps, words and lyrics. Seeded, so every run
 * reads the same scores. Each import must be canonical, parse cleanly and
 * report no importer bug, and the importer's self-check plays every part's
 * line back against the cells it meant to write (`selfcheck.ts`), so a
 * part playing other than the file says is an importer bug too.
 */
import { expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { importMusicXml } from "../../src/index.js";

/** A seeded generator: the same seed, the same score. */
function generator(seed: number) {
	let state = seed;
	const rnd = () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
	const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)] as T;
	/** `make()` with probability `p`, else nothing. */
	const maybe = (p: number, make: () => string) => (rnd() < p ? make() : "");
	return { rnd, pick, maybe };
}

type Gen = ReturnType<typeof generator>;

const ROOTS = ["C", "D", "E", "F", "G", "A", "B"];
const KINDS: [string, string][] = [
	["major", ""],
	["minor", "m"],
	["dominant", "7"],
	["major-seventh", "maj7"],
	["minor-seventh", "m7"],
	["half-diminished", "m7b5"],
	["diminished", "dim"],
	["suspended-fourth", "sus4"],
	["other", "7alt"],
	["other", ""],
	["none", "N.C."],
	["augmented", "+"],
	["Tristan", "Tristan"],
];

function harmony(g: Gen, offset?: number): string {
	const [kind, text] = g.pick(KINDS);
	const hidden = g.rnd() < 0.1 ? ' print-object="no"' : "";
	const alter = g.rnd() < 0.2 ? `<root-alter>${g.pick([-1, 1])}</root-alter>` : "";
	const bass = g.rnd() < 0.1 ? `<bass><bass-step>${g.pick(ROOTS)}</bass-step></bass>` : "";
	const at = offset === undefined ? "" : `<offset>${offset}</offset>`;
	return `<harmony${hidden}><root><root-step>${g.pick(ROOTS)}</root-step>${alter}</root><kind text="${text}">${kind}</kind>${bass}${at}</harmony>`;
}

type Voice = {
	div: number;
	len: number;
	voice: number;
	staff: number;
	slashy: boolean;
	chords: boolean;
};

function note(g: Gen, v: Voice, d: number, rest: boolean, slash: boolean, i: number): string {
	const pitch = () =>
		`<pitch><step>${g.pick(ROOTS)}</step><octave>${g.pick([3, 4, 5])}</octave></pitch>`;
	const parts = [
		i > 0 ? "<chord/>" : "",
		rest ? "<rest/>" : pitch(),
		`<duration>${d}</duration>`,
		rest ? "" : g.maybe(0.1, () => '<tie type="start"/>'),
		`<voice>${v.voice}</voice>`,
		v.staff > 1 ? `<staff>${v.staff}</staff>` : "",
		slash ? "<notehead>slash</notehead>" : "",
		rest
			? ""
			: g.maybe(0.1, () => '<lyric number="1"><syllabic>single</syllabic><text>la</text></lyric>'),
		g.maybe(0.05, () => "<notations><fermata/></notations>"),
	];
	return `<note>${parts.join("")}</note>`;
}

function voice(g: Gen, v: Voice): string {
	let out = "";
	let t = 0;
	const { div } = v;
	const durations = [div * 4, div * 2, div, div / 2, (div / 3) * 2, div / 4, div * 3, div * 1.5];
	const durs = durations.filter((d) => Number.isInteger(d) && d > 0);
	while (t < v.len) {
		const d = Math.min(g.pick(durs), v.len - t);
		if (v.chords && g.rnd() < 0.4)
			out += harmony(g, g.rnd() < 0.1 ? g.pick([1, -1, div]) : undefined);
		const rest = g.rnd() < 0.2;
		const slash = v.slashy && g.rnd() < 0.6;
		const pitches = rest || slash ? 1 : g.pick([1, 1, 2, 3]);
		for (let i = 0; i < pitches; i++) out += note(g, v, d, rest, slash, i);
		t += d;
	}
	return out;
}

/** A part's running divisions and beats while its measures are made. */
type Running = { div: number; beats: number };

/** A measure's attributes: the first sets everything, later ones sometimes change divisions or meter. */
function attributesOf(g: Gen, i: number, staves: number, r: Running): string {
	if (i === 0)
		return `<attributes><divisions>${r.div}</divisions><key><fifths>${g.pick([-2, 0, 1, 3])}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${staves === 2 ? "<staves>2</staves>" : ""}</attributes>`;
	const divisions = g.maybe(0.1, () => {
		r.div = g.pick([1, 2, 4, 8, 24]);
		return `<attributes><divisions>${r.div}</divisions></attributes>`;
	});
	const time = g.maybe(0.05, () => {
		r.beats = g.pick([2, 3, 4, 5, 6]);
		return `<attributes><time><beats>${r.beats}</beats><beat-type>4</beat-type></time></attributes>`;
	});
	return divisions + time;
}

type Shape = { staves: number; slashy: boolean; chords: boolean };

/** A measure's notes: the first voice, sometimes a second, the lower staff; now and then a whole rest or nothing. */
function bodyOf(g: Gen, shape: Shape, div: number, len: number): string {
	const v = (voice: number, staff: number, first: boolean): Voice => ({
		div,
		len,
		voice,
		staff,
		slashy: first && shape.slashy,
		chords: first && shape.chords,
	});
	const backup = `<backup><duration>${len}</duration></backup>`;
	const body =
		voice(g, v(1, 1, true)) +
		g.maybe(0.3, () => backup + voice(g, v(2, 1, false))) +
		(shape.staves === 2 ? backup + voice(g, v(5, 2, false)) : "");
	if (g.rnd() < 0.05)
		return `<note><rest measure="yes"/><duration>${len}</duration><voice>1</voice></note>`;
	return g.rnd() < 0.03 ? "" : body;
}

function part(g: Gen, id: number, count: number, structure: string[]): string {
	const shape: Shape = {
		staves: g.rnd() < 0.3 ? 2 : 1,
		slashy: g.rnd() < 0.5,
		chords: g.rnd() < 0.8,
	};
	const r: Running = { div: g.pick([1, 2, 4, 8, 24]), beats: 4 };
	let out = "";
	for (let i = 0; i < count; i++) {
		const attrs = attributesOf(g, i, shape.staves, r);
		const pickup = i === 0 && g.rnd() < 0.3;
		const len = pickup ? r.div * g.pick([1, 2, 3]) : r.div * r.beats;
		const body = bodyOf(g, shape, r.div, len);
		const [before, after] = id === 1 ? [structure[i] ?? "", structure[count + i] ?? ""] : ["", ""];
		const number = pickup ? '"0" implicit="yes"' : `"${i}"`;
		out += `<measure number=${number}>${attrs}${before}${body}${after}</measure>`;
	}
	return out;
}

const direction = (inner: string, sound = "") =>
	`<direction placement="above"><direction-type>${inner}</direction-type>${sound}</direction>`;

/** Each measure's marks before its notes, then after them. */
function marksBefore(g: Gen): string {
	const words = (list: string[]) => () => direction(`<words>${g.pick(list)}</words>`);
	return [
		g.maybe(0.15, () =>
			direction(
				`<words font-weight="bold">${g.pick(["Verse", "Chorus", "Bridge", "Intro"])}</words>`,
			),
		),
		g.maybe(0.1, () => `<barline location="left"><repeat direction="forward"/></barline>`),
		g.maybe(
			0.08,
			() =>
				`<barline location="left"><ending number="${g.pick(["1", "2", "1, 2", "3"])}" type="start"/></barline>`,
		),
		g.maybe(0.05, () => direction("<segno/>", '<sound segno="s"/>')),
		g.maybe(0.05, () => direction("<coda/>", '<sound coda="c"/>')),
		g.maybe(0.05, () => direction(`<rehearsal>${g.pick(["A", "B", "C"])}</rehearsal>`)),
		g.maybe(
			0.05,
			words(["rit.", "Swing", "Fine", "D.C. al Fine", "Cmaj7", "To Coda", "play 3x", "a tempo"]),
		),
		g.maybe(
			0.05,
			() =>
				`<direction placement="below"><direction-type><words>${g.pick(["key: G", "| la |", "## no", "some text"])}</words></direction-type></direction>`,
		),
		g.maybe(0.05, () =>
			direction(
				`<metronome><beat-unit>quarter</beat-unit><per-minute>${g.pick([80, 120])}</per-minute></metronome>`,
				`<sound tempo="100"/>`,
			),
		),
	].join("");
}

function marksAfter(g: Gen): string {
	let b = "";
	if (g.rnd() < 0.08) {
		const ending =
			g.rnd() < 0.5
				? `<ending number="${g.pick(["1", "2"])}" type="${g.pick(["stop", "discontinue"])}"/>`
				: "";
		const times = g.rnd() < 0.3 ? ` times="${g.pick([1, 3])}"` : "";
		const repeat = g.rnd() < 0.7 ? `<repeat direction="backward"${times}/>` : "";
		b += `<barline location="right">${ending}${repeat}</barline>`;
	}
	if (g.rnd() < 0.04) b += direction("<words>D.S. al Coda</words>", '<sound dalsegno="s"/>');
	if (g.rnd() < 0.04) b += direction("<words>To Coda</words>", '<sound tocoda="c"/>');
	if (g.rnd() < 0.03) b += `<barline location="right"><fermata/></barline>`;
	return b;
}

function structureOf(g: Gen, n: number): string[] {
	const before: string[] = [];
	const after: string[] = [];
	for (let i = 0; i < n; i++) {
		before.push(marksBefore(g));
		after.push(marksAfter(g));
	}
	return [...before, ...after];
}

/** A random score of one to three parts and 4 to 23 measures. */
function score(seed: number): string {
	const g = generator(seed);
	const n = 4 + Math.floor(g.rnd() * 20);
	const parts = 1 + Math.floor(g.rnd() * 3);
	const structure = structureOf(g, n);
	const software = g.rnd() < 0.3 ? "@barmark/musicxml 0.4.0" : "Finale";
	const list = Array.from(
		{ length: parts },
		(_, i) => `<score-part id="P${i + 1}"><part-name>Part ${i + 1}</part-name></score-part>`,
	).join("");
	const body = Array.from(
		{ length: parts },
		(_, i) => `<part id="P${i + 1}">${part(g, i + 1, n, structure)}</part>`,
	).join("");
	return `<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>${software}</software></encoding></identification><part-list>${list}</part-list>${body}</score-partwise>`;
}

const SEEDS = Array.from({ length: 100 }, (_, k) => 7919 + k);

test.each(SEEDS)("random score %i plays as the file does", (seed) => {
	const r = importMusicXml(score(seed));
	expect(r.diagnostics.filter((d) => d.message.startsWith("importer bug"))).toEqual([]);
	if (r.text === "") return;
	expect(printChart(r.text)).toBe(r.text);
	expect(parseChart(r.text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
});

test("most random scores import", () => {
	const imported = SEEDS.filter((seed) => importMusicXml(score(seed)).text !== "");
	expect(imported.length).toBeGreaterThan(80);
});
