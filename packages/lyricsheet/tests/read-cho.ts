/**
 * The tests' reader of our own output (spec 5.2): it splits a sheet into
 * directives, lyric lines, grid lines and blank lines, and builds no chart.
 * It is strict: anything this package would never write throws, so a
 * malformed export fails loudly. Test only; not part of the package.
 *
 * - A directive is `{name}` or `{name: value}`; the value is as written
 *   (`label="Intro" shape="1+4x4+1"`), `""` when there is none or it is
 *   empty (`{title: }`).
 * - A lyric line is tokens in order: `{ chord, before, after }` for
 *   each `[…]`, and `{ word }` for each run of text between spaces and
 *   chords. `before` and `after` say whether a space (or the line's edge)
 *   is on that side of the chord, so `the[C] river`, `the [C]river` and
 *   `the [C] river` read apart (spec 4.2). An annotation `[*N.C.]` is a
 *   chord token whose text starts with `*`, as ChordPro writes it. A word
 *   piece straight after a chord that itself follows a word with no space
 *   (`wait[D]ing`) has `joins: true`: it continues that word. A line may
 *   start with a space only before a `#` (which would otherwise start a
 *   comment line), as the export writes it.
 * - Between `{start_of_grid…}` and `{end_of_grid}` every line is a grid
 *   line, its cells split on spaces and kept as written (`|:`, `.`, `C~G`).
 */
export type ChoToken =
	| { chord: string; before: boolean; after: boolean }
	| { word: string; joins?: true };
export type ChoLine =
	| { kind: "directive"; name: string; value: string }
	| { kind: "lyrics"; tokens: ChoToken[] }
	| { kind: "grid"; cells: string[] }
	| { kind: "blank" };

const DIRECTIVE = /^\{([a-z_]+)(?:: ([^{}]*))?\}$/;
/**
 * One piece of a lyric line: a chord, a run of word text, a space, or any
 * other character (which the line may not hold). Each alternative is a
 * single step, so a malformed line is refused in time linear in its length.
 */
const PIECE = /\[([^[\]]+)\]|([^[\]\s{}]+)| |(.)/g;

function fail(n: number, line: string, why: string): never {
	throw new Error(`line ${n + 1}: ${why}: ${JSON.stringify(line)}`);
}

/** Whether the character at `at` is a space or past the line's edge. */
const spaceAt = (line: string, at: number) => at < 0 || at >= line.length || line[at] === " ";

function lyrics(line: string, n: number): ChoLine {
	// A leading space only before a `#`, which would otherwise start a comment line.
	if (/^ (?!#)| $| {2}/.test(line)) fail(n, line, "a leading, trailing or doubled space");
	const tokens: ChoToken[] = [];
	/** A word piece came since the last space (chords never end a word). */
	let inWord = false;
	for (const m of line.matchAll(PIECE)) {
		const [text, chord, word, other] = m;
		if (other !== undefined) fail(n, line, "not a lyric line");
		if (chord !== undefined) {
			const before = spaceAt(line, m.index - 1);
			tokens.push({ chord, before, after: spaceAt(line, m.index + text.length) });
		} else if (word !== undefined) {
			tokens.push(inWord ? { word, joins: true } : { word });
			inWord = true;
		} else inWord = false;
	}
	return { kind: "lyrics", tokens };
}

function grid(line: string, n: number): ChoLine {
	if (/^ | $| {2}|[[\]{}]/.test(line)) fail(n, line, "not a grid line");
	return { kind: "grid", cells: line.split(" ") };
}

/** A directive line, with the grid state it leaves behind. */
function directive(line: string, n: number, inGrid: boolean): [ChoLine, boolean] {
	const m = DIRECTIVE.exec(line) ?? fail(n, line, "not a directive");
	const [, name = "", value = ""] = m;
	if (name === "start_of_grid") {
		if (inGrid) fail(n, line, "a grid inside a grid");
		return [{ kind: "directive", name, value }, true];
	}
	if (name === "end_of_grid" && !inGrid) fail(n, line, "an end with no grid");
	return [{ kind: "directive", name, value }, inGrid && name !== "end_of_grid"];
}

/** A measure of a grid line: its cells, and the bar symbols before and after it. */
export type GridMeasure = { cells: string[]; before: string; after: string };
/** A grid line read: left-margin text, its measures, right-margin text ("" when none). */
export type GridParts = { left: string; measures: GridMeasure[]; right: string };

/** ChordPro's bar symbols: `|`, `||`, `|:`, `:|`, `:|:`, `|.`, and a volta `|2` or `:|2`. */
const BAR = /^(?:\|\||\|:|:\|:|:\||\|\.|:?\|\d+|\|)$/;
/** A cell: a chord name, an annotation `*…`, `N.C.`, `.`, `/`, or chords sharing it with `~`. */
const NAME = /^(?:[A-G]\S*|\*\S+|N\.C\.)$/;
const isCell = (cell: string, first: boolean) =>
	cell === "." ||
	cell === "/" ||
	(cell === "%" && first) ||
	(!BAR.test(cell) &&
		cell.split("~").every((p, _, all) => NAME.test(p) || (all.length > 1 && p === ".")));

/**
 * A grid line's cells as this package writes them: text before the first
 * bar symbol is the left margin, text after the last the right margin, and
 * every measure between holds at least one cell, `%` only first. Throws on
 * anything else.
 */
export function gridParts(cells: string[]): GridParts {
	const first = cells.findIndex((c) => BAR.test(c));
	const last = cells.findLastIndex((c) => BAR.test(c));
	if (first < 0 || first === last) throw new Error(`not a grid line: ${cells.join(" ")}`);
	const measures: GridMeasure[] = [];
	let open: GridMeasure | null = null;
	for (const cell of cells.slice(first, last + 1)) {
		if (BAR.test(cell)) {
			if (open) {
				if (!open.cells.length) throw new Error(`an empty measure: ${cells.join(" ")}`);
				open.after = cell;
				measures.push(open);
			}
			open = { cells: [], before: cell, after: "" };
		} else if (open && isCell(cell, open.cells.length === 0)) open.cells.push(cell);
		else throw new Error(`not a grid cell: ${cell}`);
	}
	return {
		left: cells.slice(0, first).join(" "),
		measures,
		right: cells.slice(last + 1).join(" "),
	};
}

export function readCho(text: string): ChoLine[] {
	if (!text.endsWith("\n")) throw new Error("no final newline");
	if (/[\r\t]/.test(text)) throw new Error("a carriage return or a tab");
	const out: ChoLine[] = [];
	let inGrid = false;
	const lines = text.slice(0, -1).split("\n");
	for (const [n, line] of lines.entries()) {
		if (line.startsWith("{")) {
			const [read, grid] = directive(line, n, inGrid);
			out.push(read);
			inGrid = grid;
		} else if (line === "") {
			if (inGrid) fail(n, line, "a blank line in a grid");
			out.push({ kind: "blank" });
		} else if (line.startsWith("#")) fail(n, line, "a comment line");
		else out.push(inGrid ? grid(line, n) : lyrics(line, n));
	}
	if (inGrid) throw new Error("a grid never ended");
	return out;
}
