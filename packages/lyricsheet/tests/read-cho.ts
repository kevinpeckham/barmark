/**
 * The tests' reader of our own output (spec 5.2): it splits a sheet into
 * directives, lyric lines, grid lines and blank lines, and builds no chart.
 * It is strict: anything this package would never write throws, so a
 * malformed export fails loudly. Test only; not part of the package.
 *
 * - A directive is `{name}` or `{name: value}`; the value is as written
 *   (`label="Intro" shape="1+4x4+1"`), `""` when there is none.
 * - A lyric line is tokens in order: `{ chord }` for each `[…]`, and
 *   `{ word }` for each run of text between spaces and chords. An
 *   annotation `[*N.C.]` is a chord token whose text starts with `*`, as
 *   ChordPro writes it. A word piece straight after a chord that itself
 *   follows a word with no space (`wait[D]ing`) has `joins: true`: it
 *   continues that word.
 * - Between `{start_of_grid…}` and `{end_of_grid}` every line is a grid
 *   line, its cells split on spaces and kept as written (`|:`, `.`, `C~G`).
 */
export type ChoToken = { chord: string } | { word: string; joins?: true };
export type ChoLine =
	| { kind: "directive"; name: string; value: string }
	| { kind: "lyrics"; tokens: ChoToken[] }
	| { kind: "grid"; cells: string[] }
	| { kind: "blank" };

const DIRECTIVE = /^\{([a-z_]+)(?:: ([^{}]+))?\}$/;
/** A lyric line: chords and words, no braces, and no space but one between two of them. */
const LYRIC_LINE = /^(?:\[[^[\]]+\]|[^[\]\s{}]+)+(?: (?:\[[^[\]]+\]|[^[\]\s{}]+)+)*$/;
/** A chord, or a piece of a word between chords. */
const PIECE = /\[([^[\]]+)\]|([^[\]]+)/g;

function fail(n: number, line: string, why: string): never {
	throw new Error(`line ${n + 1}: ${why}: ${JSON.stringify(line)}`);
}

/** One run between spaces: its chords, and its word pieces, each after the first joining the word. */
function run(text: string): ChoToken[] {
	let inWord = false;
	return [...text.matchAll(PIECE)].map(([, chord, word = ""]) => {
		if (chord !== undefined) return { chord };
		const token: ChoToken = inWord ? { word, joins: true } : { word };
		inWord = true;
		return token;
	});
}

function lyrics(line: string, n: number): ChoLine {
	if (!LYRIC_LINE.test(line)) fail(n, line, "not a lyric line");
	// Split on the spaces outside chords: an annotation `[*C E F# B]` holds spaces.
	return { kind: "lyrics", tokens: line.split(/ (?=[^\]]*(?:\[|$))/).flatMap(run) };
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
