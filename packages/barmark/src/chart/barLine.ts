import { noteSemitone } from "../chords/intervals.js";
import { parseNoteSet } from "../chords/noteSet.js";
import { parseChord } from "../chords/parse.js";
import type { ChordRecord, ParseResult } from "../chords/types.js";
import { isDirectionWord, readDirection } from "./direction.js";
import { parseMeter } from "./directives.js";
import { readSyllable, type Split, splitSyllable } from "./syllable.js";
import type {
	Articulation,
	Cell,
	ChartDiagnostic,
	Line,
	Meter,
	Pedal,
	Push,
	Repeat,
	SimpleSlot,
	Slot,
	Words,
} from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;

const FERMATA = new Set(["...", "…"]);

/** Whether a cell is a bar: `...`, a direction and a rehearsal mark mark a place between bars. */
export const isBar = (c: Cell) => c.kind === "slots" || c.kind === "simile";
const QUOTES = new Set(['"', "“", "”", "„"]);
const LABEL = /^@[A-Za-z0-9]+$/;
const SILENCE = new Set(["--", "–", "—"]);

/** The `x N` or `x ...` count after a bar line or heading, checked against the spec's limits. */
export function readRepeat(count: string, line: number, diagnostics: ChartDiagnostic[]): Repeat {
	if (FERMATA.has(count)) return "open";
	const n = Number(count);
	if (!Number.isSafeInteger(n)) {
		diagnostics.push({
			line,
			severity: "error",
			message: "a repeat count this large is not a number of passes",
			token: `x${count}`,
		});
		return null;
	}
	if (n < 2) {
		diagnostics.push({
			line,
			severity: "error",
			message: "a repeat count must be at least 2",
			token: `x${count}`,
		});
		return null;
	}
	if (n > 8)
		diagnostics.push({
			line,
			severity: "warning",
			message: "an unusually large repeat count",
			token: `x${count}`,
		});
	return n;
}

/**
 * Split an `x N` or `x ...` tail (`X` and `×` accepted) off the end of `text`, scanning from the
 * right so long whitespace runs stay linear. With `boundary`, the `x` must
 * start the text or follow whitespace (`## Box2` is a name).
 */
export function repeatTail(
	text: string,
	boundary: boolean,
): { rest: string; count: string } | null {
	const t = text.trimEnd();
	const x = Math.max(t.lastIndexOf("x"), t.lastIndexOf("X"), t.lastIndexOf("×"));
	if (x < 0) return null;
	const count = t.slice(x + 1).trim();
	if (!/^(\d+|\.\.\.|…)$/.test(count)) return null;
	const rest = t.slice(0, x);
	if (boundary && rest !== "" && !/\s/.test(rest.at(-1) ?? "")) return null;
	return { rest: rest.trimEnd(), count };
}

/** The `x N` a mistyped repeat (`x2` in a cell, `2x`, `(x2)`) most likely meant, or null. */
export function misplacedRepeat(token: string): string | null {
	const m =
		/^\(?\s*[xX×]\s*(\d+|\.\.\.|…)\s*\)?$/.exec(token) ?? /^\(?\s*(\d+)\s*[xX×]\s*\)?$/.exec(token);
	return m ? `x${m[1]}` : null;
}

/** Diagnostics listed per line before the rest are summarized. */
const MAX_LINE_DIAGNOSTICS = 20;

/** Split a group on `_`, leaving any `_` inside braces to the note set. */
const DOT_PLACE =
	"a dot goes on one member of a two-member group (C._D or C_D.); write other rhythms with / holds";

/**
 * Tokens that end in a dot without being dotted: `N.C.`'s spellings, a
 * run of dots (`...`), and the directions `D.S.` and `D.C.`, which keep
 * their own messages when misplaced.
 */
const UNDOTTED = /^[<>^+*]*n\.?c\.?$|^\.+$|^d\.[sc]\.$/i;

/** A member ending in a dot that is not one of the undotted tokens. */
const isDotted = (m: string) => m.endsWith(".") && !UNDOTTED.test(m);

function groupMembers(token: string): string[] {
	const out = [""];
	let depth = 0;
	for (const ch of token) {
		if (ch === "{") depth++;
		if (ch === "}") depth = Math.max(0, depth - 1);
		if (ch === "_" && depth === 0) out.push("");
		else out[out.length - 1] += ch;
	}
	return out;
}

/** Whitespace-separated tokens, keeping a brace group whole. */
function tokens(text: string): string[] {
	const out: string[] = [];
	let current = "";
	let depth = 0;
	for (const ch of text) {
		if (ch === "{") depth++;
		if (ch === "}") depth = Math.max(0, depth - 1);
		if (/\s/.test(ch) && depth === 0) {
			if (current) out.push(current);
			current = "";
		} else current += ch;
	}
	if (current) out.push(current);
	return out;
}

/** `3` or `1-3` as its passes; null when it reads as none. */
function passRange(part: string): number[] | null {
	const m = /^([1-9]\d{0,2})(?:-([1-9]\d{0,2}))?$/.exec(part);
	if (!m) return null;
	const from = Number(m[1]);
	const to = Number(m[2] ?? from);
	if (m[2] !== undefined && to <= from) return null;
	return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** `1`, `1-3` or `1,3`: the passes an ending plays on, in order; null when they read as none. */
function readPasses(text: string): number[] | null {
	const ranges = text.split(",").map(passRange);
	const passes = ranges.flatMap((r) => r ?? []).sort((a, b) => a - b);
	const repeated = new Set(passes).size !== passes.length;
	return ranges.includes(null) || repeated ? null : passes;
}

const ENDING_FORM = "an ending is |1, |2, |1-3 or |1,3, then a space";

/** A leading ending mark: the line without it, its passes, and the mark if it doesn't read. */
function readEnding(body: string): { body: string; ending: number[] | null; bad: string | null } {
	const mark = /^\|(\d[\d,-]*)(?=\s)/.exec(body);
	if (!mark) return { body, ending: null, bad: null };
	const ending = readPasses(mark[1] ?? "");
	return { body: `|${body.slice(mark[0].length)}`, ending, bad: ending ? null : mark[0] };
}

/** An ending mark left in the line, and what to say about it. */
function strayEnding(body: string): [string, string] | null {
	const m = /\|\d+\S*/.exec(body);
	if (!m) return null;
	return [m.index === 0 ? ENDING_FORM : "an ending starts its own bar line", m[0]];
}

/** Why a token can't share its cell: `%`, `...` and the words of a direction stand alone. */
function mustStandAlone(token: string): string | null {
	if (token === "%" || FERMATA.has(token)) return `${token} must be alone in a cell`;
	if (isDirectionWord(token))
		return `${token} is part of a direction, which must be alone in its cell`;
	return null;
}

/** A cell that is a direction, or what is wrong with one; null when the cell isn't one. */
function directionCell(
	rest: string,
	meter: Meter | null,
): { cell: Cell } | { problem: string; suggestion?: string } | null {
	const named = readDirection(rest);
	if (!named) return null;
	if ("direction" in named)
		return meter
			? { problem: "a one-bar meter cannot go on a direction" }
			: { cell: { kind: "direction", direction: named.direction } };
	// Only words a chord never uses make a near miss: `| D C |` is two chords, not D.C.
	if (!rest.includes(".") && !tokens(rest).some(isDirectionWord)) return null;
	return { problem: `not a direction; write ${named.suggestion}`, suggestion: named.suggestion };
}

/** The bars a bar line writes, read from its pipes alone (fermatas not counted), so a line dropped for an error still counts. */
const barsWritten = (body: string) =>
	body
		.split("|")
		.slice(1)
		.map((p) => p.trim())
		.filter((p) => p !== "" && !FERMATA.has(p) && !LABEL.test(p) && !isDirectionCell(p)).length;
const isDirectionCell = (p: string) => {
	const d = readDirection(p);
	return !!d && "direction" in d;
};

type Problem = { problem: string; token: string; suggestion?: string };

/**
 * Quoted words out of a cell (grammar 2.6): the cell with each one blanked,
 * and where each goes, before the slot it precedes.
 */
function readWords(cell: string): { bare: string; words: Words[] } | Problem {
	const words: Words[] = [];
	let bare = "";
	let open: number | null = null;
	for (const [i, ch] of [...cell].entries()) {
		if (!QUOTES.has(ch)) {
			if (open === null) bare += ch;
			continue;
		}
		if (open === null) {
			open = i;
			continue;
		}
		const text = [...cell]
			.slice(open + 1, i)
			.join("")
			.trim();
		if (!text) return { problem: "empty words between quotes", token: '""' };
		words.push({ text, at: tokens(bare).length });
		bare += " ";
		open = null;
	}
	if (open !== null)
		return { problem: "words need a closing quote", token: [...cell].slice(open).join("") };
	return { bare, words };
}

/** A leading `[n/d]` and the rest of the cell; `bad` is a bracket that is no time signature. */
function readMeter(cell: string): { meter: Meter | null; after: string; bad: string | null } {
	const bracket = /^\[([^\]]*)\]/.exec(cell);
	if (!bracket) return { meter: null, after: cell, bad: null };
	const meter = parseMeter(bracket[1] ?? "");
	return { meter, after: cell.slice(bracket[0].length).trim(), bad: meter ? null : bracket[0] };
}

const emptyCell = (words: Words[]) =>
	words.length ? "words go on a bar; this cell has no slot" : "a cell needs at least one slot";

/** `%` or `...` alone in a cell, or what is wrong with it; null when the cell is neither. */
function symbolCell(
	bare: string,
	meter: Meter | null,
	words: Words[],
): { cell: Cell } | Problem | null {
	const only = tokens(bare);
	const t = only[0] ?? "";
	if (only.length !== 1 || (t !== "%" && !FERMATA.has(t))) return null;
	if (meter) return { problem: "a one-bar meter cannot go on % or ...", token: t };
	if (t !== "%")
		return words.length
			? { problem: "words go on a bar, not on ...", token: t }
			: { cell: { kind: "fermata" } };
	// Words on `%` go on the whole bar.
	const onBar = words.map((w) => ({ ...w, at: 0 }));
	return { cell: words.length ? { kind: "simile", words: onBar } : { kind: "simile" } };
}

/** A direction alone in a cell, or what is wrong with it; null when the cell isn't one. */
function directionWithWords(
	bare: string,
	meter: Meter | null,
	words: Words[],
): { cell: Cell } | Problem | null {
	const token = bare.trim();
	const d = directionCell(token, meter);
	if (!d) return null;
	if (!("cell" in d))
		return { problem: d.problem, token, ...(d.suggestion ? { suggestion: d.suggestion } : {}) };
	return words.length ? { problem: "words go on a bar, not on a direction", token } : d;
}

const ARTICULATION: Record<string, Articulation> = { ">": "accent", "^": "hit" };
const PUSH: Record<number, Push> = { 1: "eighth", 2: "sixteenth" };

const PEDAL: Record<string, Pedal> = { "+": "press", "*": "release" };

type Marks = { pedal?: Pedal; push?: Push; articulation?: Articulation; rest: string };

/** A slot's leading marks (grammar 2.7–2.9): a pedal mark, a push, an articulation, then the slot. */
function readMarks(token: string): Marks | Problem {
	const late = /^([<>^]+)([+*])(.*)$/.exec(token);
	if (late)
		return {
			problem: "a pedal mark comes before a push or an accent",
			token,
			suggestion: `${late[2]}${late[1]}${late[3]}`,
		};
	const pedal = PEDAL[token[0] ?? ""];
	const marked = readPushAndAccent(pedal ? token.slice(1) : token, token);
	return "problem" in marked || !pedal ? marked : { pedal, ...marked };
}

/** A push, then an articulation, then the slot itself (grammar 2.7, 2.8). */
function readPushAndAccent(
	token: string,
	written: string,
): { push?: Push; articulation?: Articulation; rest: string } | Problem {
	const pushes = /^<*/.exec(token)?.[0].length ?? 0;
	const push = PUSH[pushes];
	if (pushes && !push)
		return { problem: "a push is < (an eighth) or << (a sixteenth)", token: written };
	const marked = readArticulation(token.slice(pushes), written);
	return "problem" in marked ? marked : { ...(push ? { push } : {}), ...marked };
}

/** A leading `>` or `^`, and the slot after it; a push after it is written in the wrong order. */
function readArticulation(
	text: string,
	token: string,
): { articulation?: Articulation; rest: string } | Problem {
	const articulation = ARTICULATION[text[0] ?? ""];
	if (!articulation) return { rest: text };
	const rest = text.slice(1);
	if (!rest.startsWith("<")) return { articulation, rest };
	const suggestion = rest.replace(/^(<+)/, `$1${text[0]}`);
	return { problem: "a push and an accent: write the push first", token, suggestion };
}

const UNPUSHABLE = new Set(["/", "?", "%", "...", "…"]);

/** Why these marks can't go on this slot; null when they can. */
/** Whether a slot is one of `/`, `?`, `--` or `N.C.`, which take no accent or pedal. */
const isPlain = (rest: string) =>
	UNPUSHABLE.has(rest) || SILENCE.has(rest) || /^n\.?c\.?$/i.test(rest);

/** Each rule on marks: when it is broken, and what the error says. */
const MARK_RULES: [(m: Marks, inGroup: boolean) => boolean, string][] = [
	[(m, inGroup) => Boolean(m.push) && inGroup, "a push goes on a whole slot, not inside a group"],
	[
		(m) => Boolean(m.push) && UNPUSHABLE.has(m.rest),
		"a push goes on a chord, a note set, N.C. or --",
	],
	[
		(m) => Boolean(m.articulation) && isPlain(m.rest),
		"an accent or a hit goes on a chord or a note set",
	],
	[(m) => Boolean(m.pedal) && isPlain(m.rest), "a pedal mark goes on a chord or a note set"],
];

function marksProblem(marks: Marks, inGroup: boolean, token: string): Problem | null {
	const broken = MARK_RULES.find(([breaks]) => breaks(marks, inGroup));
	return broken ? { problem: broken[1], token } : null;
}

const NOT_A_NOTE_SET = "a syllable follows a note set, like {G4}:la";

/** The slot with this syllable sung on it, or why it can't be (grammar 4.3). */
function sungOn(slot: SimpleSlot, written: string): SimpleSlot | { problem: string } {
	if (slot.kind === "chord" && slot.voicing)
		return {
			problem: `a syllable goes on a note set, not a voicing; write the notes alone (${slot.voicing.canonical}:${written})`,
		};
	if (slot.kind !== "chord" || slot.chord.kind !== "notes") return { problem: NOT_A_NOTE_SET };
	if (written.includes("{"))
		return { problem: "a syllable ends at {; put a space before the next note" };
	const syllable = readSyllable(written);
	if (syllable) return { ...slot, syllable };
	return { problem: unreadSyllable(written) };
}

/** Why a syllable token reads as no syllable. */
function unreadSyllable(written: string): string {
	if (written === "/-") return "a hold can't begin or continue a word; write :/ alone";
	return written.includes("~")
		? "~ joins two syllables; write one on each side"
		: "an empty syllable; write one after the colon, or leave the note unsung";
}

/** Whether a voicing's note is one of the chord's, by pitch class. */
const inChord = (note: string, chord: ChordRecord) => {
	const pc = (n: string) => (noteSemitone(n.replace(/\d|!/g, "")) + 12) % 12;
	return chord.pitches.some((p) => pc(p) === pc(note));
};

/** `Cmaj7{E3 G3 B3}`: the chord, and the notes it is voiced with, each one of its own (grammar 4.2). */
function parseVoiced(
	token: string,
	brace: number,
): { chord: ChordRecord; voicing: ChordRecord; warnings: ParseResult[] } | Problem {
	const chord = parseChord(token.slice(0, brace));
	if (!chord.ok)
		return {
			problem: chord.error.message,
			token,
			...(chord.error.suggestion ? { suggestion: chord.error.suggestion } : {}),
		};
	const voicing = parseNoteSet(token.slice(brace));
	if (!voicing.ok) return { problem: voicing.error.message, token: voicing.error.token };
	const stray = voicing.value.pitches.find((n) => !inChord(n, chord.value));
	if (stray)
		return {
			problem: `${stray.replace(/\d/g, "")} is not in ${chord.value.canonical}`,
			token: stray,
		};
	return { chord: chord.value, voicing: voicing.value, warnings: [chord, voicing] };
}

/** A cell that is one thing alone (a mark, a direction, `%` or `...`), or what is wrong with it. */
const standalone = (bare: string, meter: Meter | null, words: Words[]) =>
	rehearsalCell(bare, meter, words) ??
	directionWithWords(bare, meter, words) ??
	symbolCell(bare, meter, words);

/** A `@B` cell, or what is wrong with one; null when the cell has no mark. */
function rehearsalCell(
	bare: string,
	meter: Meter | null,
	words: Words[],
): { cell: Cell } | Problem | null {
	const list = tokens(bare);
	const at = list.findIndex((t) => t.startsWith("@"));
	const mark = list[at];
	if (mark === undefined) return null;
	if (!LABEL.test(mark))
		return {
			problem: "a rehearsal mark is @ and a label of letters and digits, like @B or @17",
			token: mark,
		};
	if (words.length) return { problem: "words go on a bar, not on a rehearsal mark", token: mark };
	if (meter) return { problem: "a one-bar meter cannot go on a rehearsal mark", token: mark };
	if (list.length === 1) return { cell: { kind: "rehearsal", label: mark.slice(1) } };
	const others = list.filter((_, i) => i !== at).join(" ");
	return {
		problem: "a rehearsal mark is a cell of its own",
		token: mark,
		suggestion: `| ${mark} | ${others} |`,
	};
}

/**
 * One bar line: cells between pipes, each cell's slots, the `|:` and `:|`
 * marks and an `x N` tail. Any error drops the whole line (`bars` is null);
 * `written` still says how many bars it writes.
 */
export function parseBarLine(
	text: string,
	line: number,
): { bars: BarsLine | null; written: number; diagnostics: ChartDiagnostic[] } {
	const diagnostics: ChartDiagnostic[] = [];
	let listed = 0;
	const add = (d: ChartDiagnostic) => {
		listed++;
		if (listed <= MAX_LINE_DIAGNOSTICS) diagnostics.push(d);
		else if (listed === MAX_LINE_DIAGNOSTICS + 1)
			diagnostics.push({
				line,
				severity: "error",
				message: "further problems on this line are not listed",
				token: "",
			});
	};
	const error = (message: string, token: string, suggestion?: string): null => {
		add({ line, severity: "error", message, token, ...(suggestion ? { suggestion } : {}) });
		return null;
	};
	const warn = (message: string, token: string) =>
		add({ line, severity: "warning", message, token });

	let body = text.trim();
	let repeat: Repeat = null;
	const lastPipe = body.lastIndexOf("|");
	const tail = repeatTail(body.slice(lastPipe + 1), true);
	if (tail) {
		body = body.slice(0, lastPipe + 1) + tail.rest;
		repeat = readRepeat(tail.count, line, diagnostics);
	}
	const leading = readEnding(body);
	body = leading.body;
	const ending = leading.ending;
	if (leading.bad) error(ENDING_FORM, leading.bad);
	const opens = body.startsWith("|:");
	if (opens) body = `|${body.slice(2)}`;
	const closes = body.endsWith(":|");
	if (closes) body = `${body.slice(0, -2)}|`;
	const written = barsWritten(body);
	const stray = strayEnding(body);
	if (stray) error(...stray);
	if (body.includes(":|") || body.includes("|:"))
		error("|: must open a bar line and :| must close one", body.includes(":|") ? ":|" : "|:");
	// A misplaced mark makes the cells unreadable: report it once, not again as chords.
	if (diagnostics.some((d) => d.severity === "error")) return { bars: null, written, diagnostics };

	const parts = body.split("|").slice(1);
	if (parts.at(-1)?.trim() === "") parts.pop();
	else warn("missing trailing |", parts.at(-1)?.trim() ?? "");

	const report = (p: Problem): null => error(p.problem, p.token, p.suggestion);
	const simple = (token: string): SimpleSlot | null => {
		if (token === "/") return { kind: "hold" };
		if (SILENCE.has(token)) return { kind: "silence" };
		if (token === "-") return error("a lone - is not a slot; silence is --", token, "--");
		if (token === "?") {
			warn("unknown harmony", token);
			return { kind: "unknown" };
		}
		if (/^n\.?c\.?$/i.test(token)) return { kind: "nc" };
		const misplaced = misplacedRepeat(token);
		if (misplaced) return error("a repeat is written x N after the final |", token, misplaced);
		const alone = mustStandAlone(token);
		if (alone) return error(alone, token);
		return chordSlot(token);
	};
	/** A chord, a note set, or a chord with its voicing. */
	const chordSlot = (token: string): SimpleSlot | null => {
		const brace = token.indexOf("{");
		if (brace > 0) {
			const v = parseVoiced(token, brace);
			if ("problem" in v) return report(v);
			for (const r of v.warnings) for (const w of r.ok ? r.warnings : []) warn(w.message, w.token);
			return { kind: "chord", chord: v.chord, voicing: v.voicing };
		}
		const r = brace === 0 ? parseNoteSet(token) : parseChord(token);
		if (!r.ok) return error(r.error.message, token, r.error.suggestion);
		for (const w of r.warnings) warn(w.message, w.token);
		return { kind: "chord", chord: r.value };
	};
	/** A slot with its push and articulation, if written. */
	const markedSlot = (token: string, inGroup: boolean): SimpleSlot | null => {
		const marks = readMarks(token);
		if ("problem" in marks) return report(marks);
		const problem = marksProblem(marks, inGroup, token);
		if (problem) return report(problem);
		const base = simple(marks.rest);
		const { pedal, push, articulation } = marks;
		return (
			base &&
			({
				...base,
				...(pedal ? { pedal } : {}),
				...(push ? { push } : {}),
				...(articulation ? { articulation } : {}),
			} as SimpleSlot)
		);
	};

	/** A group member, dotted when it ends in a dot that is not part of `N.C.` (grammar 2.2). */
	const memberOf = (m: string): SimpleSlot | null => {
		if (!isDotted(m)) return markedSlot(m, true);
		const s = markedSlot(m.slice(0, -1), true);
		return s && { ...s, dotted: true };
	};
	/** A slot read by `read`, with the syllable written after it, if any (grammar 4.3). */
	const withSyllable = (
		{ note, syllable }: Split,
		read: (note: string) => SimpleSlot | null,
	): SimpleSlot | null => {
		const written = `${note}:${syllable}`;
		if (syllable !== null && !note) return error(NOT_A_NOTE_SET, written);
		const slot = read(note);
		if (syllable === null || !slot) return slot;
		const sung = sungOn(slot, syllable);
		return "problem" in sung ? error(sung.problem, written) : sung;
	};
	/** One slot token: a simple slot, or a `_` group of them. */
	const slotOf = (token: string): Slot | null => {
		const members = groupMembers(token).map(splitSyllable);
		const dots = members.filter((m) => isDotted(m.note)).length;
		if (dots && (members.length !== 2 || dots > 1)) return error(DOT_PLACE, token);
		const [only] = members;
		if (only && members.length === 1) return withSyllable(only, (n) => markedSlot(n, false));
		return groupOf(members, token);
	};
	const groupOf = (members: Split[], token: string): Slot => {
		const out: SimpleSlot[] = [];
		for (const m of members) {
			const s =
				m.note || m.syllable !== null
					? withSyllable(m, memberOf)
					: error("an empty member in a group", token);
			if (s) out.push(s);
		}
		return { kind: "group", members: out };
	};
	const readCell = (raw: string): Cell | null => {
		const rest = raw.trim();
		if (!rest) return error("an empty cell; use / to hold or % to repeat", "| |");
		const { meter, after, bad } = readMeter(rest);
		if (bad) error("not a time signature", bad);
		const read = readWords(after);
		if ("problem" in read) return report(read);
		const { bare, words } = read;
		if (bare.includes("[")) return error("a [n/d] meter must start its cell", rest);
		const alone = standalone(bare, meter, words);
		if (alone) return "cell" in alone ? alone.cell : report(alone);
		return slotsCell(bare, meter, words, raw.trim());
	};
	const slotsCell = (
		bare: string,
		meter: Meter | null,
		words: Words[],
		raw: string,
	): Cell | null => {
		const slots = tokens(bare).map(slotOf);
		if (!slots.length) return error(emptyCell(words), raw);
		const kept = slots.filter((x): x is Slot => x !== null);
		return { kind: "slots", meter, slots: kept, ...(words.length ? { words } : {}) };
	};

	if (parts.length === 0) error("a bar line needs at least one cell", text.trim());
	const cells = parts.map(readCell).filter((c): c is Cell => c !== null);

	const failed = diagnostics.some((d) => d.severity === "error");
	return {
		bars: failed ? null : { kind: "bars", line, opens, closes, cells, repeat, ending },
		written,
		diagnostics,
	};
}
