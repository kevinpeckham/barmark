/**
 * Verses as lyric rows (grammar 7.7): verse 1 is on the singing line's
 * notes, later verses of the singer are `lyrics N:` rows under each system,
 * a lyric staff's words are rows on no melody, and a section sung again
 * with new words is a replay whose rows carry them. Also what the chart
 * means to sing, bar by bar, for the self-check.
 */
import type { Losses } from "./losses.js";
import type { SungEvent, Words } from "./lyrics.js";
import { sings } from "./lyrics.js";
import type { ImportedPart } from "./parts.js";

/**
 * Whose words the lyric rows write: the singer's (`owner`, the first part
 * with a voice instrument, else the first that sings, as grammar 7.7
 * reads it) from verse 2, or a lyric staff's from verse 1.
 */
export type Verses = {
	words: Words;
	from: number;
	owner: number | null;
	/**
	 * The rows' holds as written, by `holdKey`: those barmark sings, and
	 * those it can't (written `--`); and each verse's last row: whether it
	 * ended holding a syllable, which a row starting with `/` holds on, and
	 * its last bar.
	 */
	holds: { kept: Set<string>; dropped: Set<string>; ends: Map<number, RowEnd> };
};

/** Where a verse's last row ended: holding a syllable or not, at which bar, and whether that bar plays plainly. */
type RowEnd = { holding: boolean; bar: number; plain: boolean };

const newHolds = () => ({
	kept: new Set<string>(),
	dropped: new Set<string>(),
	ends: new Map<number, RowEnd>(),
});

/**
 * What a row starts holding: what its verse's row before it left held,
 * when barmark is sure to have sung that row just before this one (the
 * bar before, both playing plainly); else nothing, and a hold the file
 * carries in is written `--`, which barmark then reads as it means.
 */
function carried(bars: RowBar[], verse: number, holds: Verses["holds"]): boolean {
	const end = holds.ends.get(verse);
	const first = bars[0];
	if (!end?.holding || !first || !end.plain) return false;
	return end.bar + 1 === first.bar && bars.every((b) => b.plain === true);
}

/** A row's hold as the self-check knows it: the written bar it lies under, its verse and its onset as a share of the bar. */
const holdKey = (bar: number, verse: number, share: number) =>
	`${bar}|${verse}|${Math.round(share * 1e6)}`;

/** The bars a row lies under: each one's measure, and the written bar (its index in the writer's bars) it lies under. */
/**
 * A bar a row covers: its measure, its place among the bars, and whether
 * it plays plainly, once each time it is reached (no repeat or ending),
 * so a verse's rows there are sung on every pass.
 */
export type RowBar = { measure: number; bar: number; plain?: boolean };

const STAFF_LEFT_OUT = "the lyric staff's words left out: a part sings words of its own";

/** The singer by grammar 7.7's rule: the first part with a voice instrument, else the first whose notes carry syllables. */
function ownerOf(parts: ImportedPart[]): number | null {
	const voice = parts.findIndex((p) => p.instrument === "voice");
	const at = voice >= 0 ? voice : parts.findIndex((p) => p.sings?.words.verses.includes(1));
	return at < 0 ? null : at;
}

const hasWords = (p: ImportedPart) => (p.sings?.words.verses.length ?? 0) > 0;

/** Reports a part's verses 2 and later, which no row holds, in the measures they're sung in. */
function laterLeftOut(p: ImportedPart, singer: ImportedPart | undefined, losses: Losses): void {
	const why = singer
		? `the lyric rows are ${singer.name}'s`
		: "no part sings verse 1 or is a voice to sing them";
	const message = `verses 2 and later in ${p.name} left out (${why})`;
	p.sings?.words.bars.forEach((events, m) => {
		if (events.some((e) => [...e.tokens.keys()].some((v) => v > 1)))
			losses.add("verses", message, p.name, p.lyrics[m]?.number);
	});
}

/** Whose rows the chart writes, reporting the verses no row can hold (another part's later verses, a lyric staff beside parts that sing). */
export function versesOf(
	parts: ImportedPart[],
	staff: Words | null,
	losses: Losses,
): Verses | null {
	const owner = ownerOf(parts);
	const singer = owner === null ? undefined : parts[owner];
	parts.forEach((p, i) => {
		if (i !== owner) laterLeftOut(p, singer, losses);
	});
	if (staff && staff.verses.length > 0) {
		if (!parts.some(hasWords))
			return {
				words: staff,
				from: 1,
				owner,
				holds: newHolds(),
			};
		losses.add("staff", STAFF_LEFT_OUT);
	}
	const words = singer?.sings?.words;
	return words ? { words, from: 2, owner, holds: newHolds() } : null;
}

/**
 * A row's cells with each `/` read as barmark reads it (grammar 7.7): it
 * holds a syllable only after one of its verse's, until a breath. A row
 * starts holding what its verse's row before it left held when that is
 * sure (`carried`), else nothing. A `/` with nothing to hold (the file held a
 * syllable sung in another order than the chart plays) is written `--`,
 * which it means; the holds are noted for the self-check.
 */
function settled(cells: string[], bars: RowBar[], verse: number, holds: Verses["holds"]) {
	let holding = carried(bars, verse, holds);
	const out = cells
		.map((cell, c) => {
			const slots = cell.split(" ");
			return slots
				.map((slot, i) => {
					const members = slot.split("_");
					return members
						.map((token, j) => {
							const share = (i * members.length + j) / (slots.length * members.length);
							const key = holdKey(bars[c]?.bar ?? -1, verse, share);
							if (token !== "/") holding = token !== "--";
							else (holding ? holds.kept : holds.dropped).add(key);
							return token === "/" && !holding ? "--" : token;
						})
						.join("_");
				})
				.join(" ");
		})
		.map(breathes);
	const last = bars.at(-1);
	if (last) holds.ends.set(verse, { holding, bar: last.bar, plain: last.plain === true });
	return out;
}

/** A cell, or a slot of it, that only breathes, written as one breath. */
function breathes(cell: string): string {
	const slots = cell.split(" ").map((slot) => (/^--(_--)*$/.test(slot) ? "--" : slot));
	return slots.every((slot) => slot === "--") ? "--" : slots.join(" ");
}

/** A cell's slots spread `by` times as many: each member a slot of its own (`a_b` by 2 is `a b`), or held (`/`) over the new ones; null where a slot can't be spread evenly. */
function spread(cell: string, by: number): string[] | null {
	const out: string[] = [];
	for (const slot of cell.split(" ")) {
		const members = slot.split("_");
		const g = members.length;
		if (by % g === 0) for (const m of members) out.push(m, ...Array<string>(by / g - 1).fill("/"));
		else if (g % by === 0)
			for (let i = 0; i < g; i += g / by) out.push(members.slice(i, i + g / by).join("_"));
		else return null;
	}
	return out;
}

/** A place in a bar, as a key: a share of the bar, rounded. */
const shareKey = (share: number) => Math.round(share * 1e6);

/** Whether a cell may be spread: not a bar held whole, and no breath (a hold after one holds nothing). */
const spreads = (cell: string) => cell !== "/" && !cell.includes("--");

/** The finest of a row's bars that may be spread, in slots a beat, as [n, d]. */
function finest(cells: string[], beats: number[]): [number, number] {
	let [n, d] = [0, 1];
	cells.forEach((cell, i) => {
		const [k, b] = [cell.split(" ").length, beats[i] ?? 4];
		if (spreads(cell) && k * d > n * b) [n, d] = [k, b];
	});
	return [n, d];
}

/** A cell spread to `want` slots, where that says nothing new (no new slot starts on a note); else as it is. */
function spreadTo(v: Verses, cell: string, want: number, measure: number): string {
	const k = cell.split(" ").length;
	if (!spreads(cell) || !Number.isInteger(want) || want <= k || want % k) return cell;
	const out = spread(cell, want / k)?.join(" ");
	if (out === undefined) return cell;
	const length = v.words.lengths[measure] ?? 4;
	const onsets = new Set(
		(v.words.bars[measure] ?? []).map((e) => shareKey(e.at.n / e.at.d / length)),
	);
	const before = new Set(startsAt(cell));
	return startsAt(out).every((at) => before.has(at) || !onsets.has(at)) ? out : cell;
}

/**
 * A row's cells on one grid, as a chart writes a row: a bar that needs
 * fewer slots than the finest bar (for its beats) is spread to as many,
 * its syllables held over the new slots (`fear` is `fear / /` beside
 * `grace / that`). Only where that says nothing new: never over a new
 * note (a hold there would sing on it) and never after a breath.
 */
function oneGrid(v: Verses, cells: string[], bars: RowBar[]): string[] {
	const beats = bars.map(({ measure }) => v.words.beats[measure] ?? 4);
	const [n, d] = finest(cells, beats);
	return cells.map((cell, i) =>
		spreadTo(v, cell, ((beats[i] ?? 4) * n) / d, bars[i]?.measure ?? -1),
	);
}

/** Where a cell's slots and members start, as `shareKey`s. */
function startsAt(cell: string): number[] {
	const slots = cell.split(" ");
	return slots.flatMap((slot, i) => {
		const members = slot.split("_");
		return members.map((_, j) =>
			shareKey((i * members.length + j) / (slots.length * members.length)),
		);
	});
}

/** A row: its label, then the verse's cell in each of these bars. */
function row(v: Verses, verse: number, label: string, bars: RowBar[]): string {
	const read = bars.map(({ measure }) => v.words.rows.get(verse)?.[measure] ?? "--");
	const written = oneGrid(v, read, bars);
	const cells = v.words.onNotes ? settled(written, bars, verse, v.holds) : written;
	return `${label} | ${cells.join(" | ")} |`;
}

const labelOf = (verse: number, numbered: boolean) => (numbered ? `lyrics ${verse}:` : "lyrics:");

/**
 * The rows under a system: each later verse its bars sing (from verse 1
 * for a lyric staff), numbered when one is past verse 1, or in an ending
 * (`inEnding`) of a chart that numbers its verses; else verse 1 alone is
 * `lyrics:`.
 */
export function rowsUnder(v: Verses | null, bars: RowBar[], inEnding = false): string[] {
	if (!v) return [];
	const sung = v.words.verses.filter(
		(verse) => verse >= v.from && bars.some(({ measure }) => sings(v.words.bars[measure], verse)),
	);
	const numbered = sung.some((n) => n !== 1) || (inEnding && v.words.verses.some((n) => n !== 1));
	return sung.map((verse) => row(v, verse, labelOf(verse, numbered), bars));
}

/** A bar's words as one key: every verse's tokens at their onsets. */
const barWords = (events: SungEvent[] | undefined) =>
	JSON.stringify((events ?? []).map((e) => [e.at, [...e.tokens].sort(([a], [b]) => a - b)]));

/**
 * The rows under a replay heading, when it sings other words than the
 * section it replays (`root`, the one written out): one row per line the
 * section is written in (`lines`, positions in the section by written
 * line), each verse's rows starting again at its first line; a replay
 * that sings nothing breathes through. None when the words are the same.
 */
export function replayRows(
	v: Verses | null,
	replay: RowBar[],
	root: number[],
	lines: number[][],
): string[] {
	const same = (b: RowBar, k: number) =>
		barWords(v?.words.bars[b.measure]) === barWords(v?.words.bars[root[k] ?? -1]);
	if (!v || replay.every(same)) return [];
	const sung = v.words.verses.filter((verse) =>
		replay.some(({ measure }) => sings(v.words.bars[measure], verse)),
	);
	const verses = sung.length > 0 ? sung : [1];
	const numbered = verses.some((verse) => verse !== 1);
	return verses.flatMap((verse) =>
		lines.map((line) =>
			row(
				v,
				verse,
				labelOf(verse, numbered),
				line.flatMap((k) => replay[k] ?? []),
			),
		),
	);
}

/** A syllable as the self-check compares it: who sings it, its verse, its onset as a share of its bar, what it says and whether it lands on a note. */
export const sungKey = (part: string, verse: number, at: number, token: string, note: boolean) =>
	`${part}|${verse}|${Math.round(at * 1e6)}|${token}|${note}`;

/**
 * What measure `m` sings, as the chart means it: each part's syllables on
 * its notes (verse 1), and the rows' verses for their singer, or for no
 * one; `label` names a part as the chart does ("" when it names none).
 */
export function meantAt(
	parts: ImportedPart[],
	v: Verses | null,
	{ measure: m, bar }: RowBar,
	label: (p: number | null) => string,
): string[] {
	const share = (words: Words, e: SungEvent) => e.at.n / e.at.d / (words.lengths[m] ?? 4);
	// A row's `/` that barmark reads as nothing held, where every row that writes it says so.
	const unheld = (verse: number, at: number) => {
		const key = holdKey(bar, verse, at);
		return !!v?.holds.dropped.has(key) && !v.holds.kept.has(key);
	};
	const keys = (words: Words, who: string, verses: (n: number) => boolean) =>
		(words.bars[m] ?? []).flatMap((e) =>
			[...e.tokens]
				.filter(([verse, token]) => verses(verse) && (words.onNotes || token !== "/"))
				.filter(([verse, token]) => token !== "/" || verse === 1 || !unheld(verse, share(words, e)))
				.map(([verse, token]) => sungKey(who, verse, share(words, e), token, words.onNotes)),
		);
	// The singer's later verses are its rows; a lyric staff's rows are every verse.
	const later = (i: number) => v?.from === 2 && v.owner === i;
	const own = parts.flatMap((p, i) =>
		p.sings ? keys(p.sings.words, label(i), (n) => n === 1 || later(i)) : [],
	);
	const staff = v?.from === 1 ? keys(v.words, label(v.owner), () => true) : [];
	return [...own, ...staff];
}
