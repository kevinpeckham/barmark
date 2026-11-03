import { parseNoteSet } from "../chords/noteSet.js";
import { parseChord } from "../chords/parse.js";
import { isDirectionWord, readDirection } from "./direction.js";
import { parseMeter } from "./directives.js";
import type { Cell, ChartDiagnostic, Line, Meter, Repeat, SimpleSlot, Slot } from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;

const FERMATA = new Set(["...", "…"]);

/** Whether a cell is a bar: `...` and a direction mark a place between bars. */
export const isBar = (c: Cell) => c.kind !== "fermata" && c.kind !== "direction";
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
		.filter((p) => p !== "" && !FERMATA.has(p)).length;

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
		const r = token.startsWith("{") ? parseNoteSet(token) : parseChord(token);
		if (!r.ok) return error(r.error.message, token, r.error.suggestion);
		for (const w of r.warnings) warn(w.message, w.token);
		return { kind: "chord", chord: r.value };
	};

	if (parts.length === 0) error("a bar line needs at least one cell", text.trim());
	const cells: Cell[] = [];
	for (const raw of parts) {
		let rest = raw.trim();
		if (!rest) {
			error("an empty cell; use / to hold or % to repeat", "| |");
			continue;
		}
		let meter: Meter | null = null;
		const bracket = /^\[([^\]]*)\]/.exec(rest);
		if (bracket) {
			meter = parseMeter(bracket[1] ?? "");
			if (!meter) error("not a time signature", bracket[0]);
			rest = rest.slice(bracket[0].length).trim();
		}
		if (rest.includes("[")) {
			error("a [n/d] meter must start its cell", rest);
			continue;
		}
		const direction = directionCell(rest, meter);
		if (direction && "cell" in direction) cells.push(direction.cell);
		else if (direction) error(direction.problem, rest, direction.suggestion);
		if (direction) continue;
		const list = tokens(rest);
		if (list.length === 0) {
			error("a cell needs at least one slot", raw.trim());
			continue;
		}
		if (list.length === 1 && meter && (list[0] === "%" || FERMATA.has(list[0] ?? ""))) {
			error("a one-bar meter cannot go on % or ...", rest);
			continue;
		}
		if (list.length === 1 && !meter && list[0] === "%") {
			cells.push({ kind: "simile" });
			continue;
		}
		if (list.length === 1 && !meter && FERMATA.has(list[0] ?? "")) {
			cells.push({ kind: "fermata" });
			continue;
		}
		const slots: Slot[] = [];
		for (const token of list) {
			const parts = groupMembers(token);
			if (parts.length === 1) {
				const s = simple(token);
				if (s) slots.push(s);
				continue;
			}
			const members: SimpleSlot[] = [];
			for (const m of parts) {
				if (!m) error("an empty member in a group", token);
				else {
					const s = simple(m);
					if (s) members.push(s);
				}
			}
			slots.push({ kind: "group", members });
		}
		cells.push({ kind: "slots", meter, slots });
	}

	const failed = diagnostics.some((d) => d.severity === "error");
	return {
		bars: failed ? null : { kind: "bars", line, opens, closes, cells, repeat, ending },
		written,
		diagnostics,
	};
}
