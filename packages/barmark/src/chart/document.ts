import { parseChord } from "../chords/parse.js";
import { misplacedRepeat, parseBarLine, readRepeat, repeatTail } from "./barLine.js";
import { creditsOf, nearCredit, readCredit } from "./credits.js";
import { parseDirectiveLine } from "./directives.js";
import { checkLines } from "./lines.js";
import { attachLyrics, readLyricRow } from "./lyricRows.js";
import { readPart } from "./partLine.js";
import { groupSystems } from "./systems.js";
import type { ChartDiagnostic, Credits, DeclaredPart, Line, Part, Repeat } from "./types.js";

const NEAR_DIRECTIVES: Record<string, string> = {
	meter: "time",
	signature: "time",
	bpm: "tempo",
	groove: "feel",
	instrument: "part",
	parts: "part",
};

/**
 * Several parts each need a label, and no two may share one in any case
 * (grammar 7.4). A part that breaks either rule is text, with the error.
 */
function checkParts(lines: Line[], diagnostics: ChartDiagnostic[]): Part[] {
	const declared = lines.filter((l): l is Extract<Line, { kind: "part" }> => l.kind === "part");
	if (declared.length < 2) return declared.map(partOf);
	const seen = new Map<string, string>();
	const parts: Part[] = [];
	for (const l of declared) {
		const problem = partProblem(l, seen);
		if (!problem) {
			parts.push(partOf(l));
			continue;
		}
		const text = l.label ? `part: ${l.label} = ${l.name}` : `part: ${l.name}`;
		diagnostics.push({ line: l.line, severity: "error", token: text, ...problem });
		lines[lines.indexOf(l)] = { kind: "text", line: l.line, text };
	}
	return parts;
}

const partOf = (l: Part): Part => ({
	...(l.label && { label: l.label }),
	name: l.name,
	...(l.instrument && { instrument: l.instrument }),
	...(l.clef && { clef: l.clef }),
});

function partProblem(
	l: Part,
	seen: Map<string, string>,
): { message: string; suggestion?: string } | null {
	if (!l.label)
		return {
			message: "a chart with several parts labels each one",
			suggestion: `part: Label = ${l.name}`,
		};
	const key = l.label.toLowerCase();
	const first = seen.get(key);
	if (first) return { message: `two parts share the label ${first}` };
	seen.set(key, l.label);
	return null;
}

function readHeading(text: string, line: number, diagnostics: ChartDiagnostic[]): Line {
	let rest = text.trim();
	const elided = /(->|→)$/.test(rest);
	if (elided) rest = rest.replace(/(->|→)$/, "").trim();
	let repeat: Repeat = null;
	const tail = repeatTail(rest, true);
	if (tail) {
		repeat = readRepeat(tail.count, line, diagnostics);
		rest = tail.rest.trim();
	}
	const typo = /\s(\S+)$/.exec(rest);
	const meant = typo?.[1] ? misplacedRepeat(typo[1]) : null;
	if (typo && meant)
		diagnostics.push({
			line,
			severity: "warning",
			message: "a section repeat is written x N",
			token: typo[1] ?? "",
			suggestion: `## ${rest.slice(0, typo.index)} ${meant}`,
		});
	if (/->|→/.test(rest))
		diagnostics.push({
			line,
			severity: "error",
			message: "-> goes at the end of a replay heading",
			token: "->",
		});
	if (!rest)
		diagnostics.push({
			line,
			severity: "error",
			message: "a section heading needs a name",
			token: text,
		});
	return { kind: "section", line, name: rest, repeat, elided };
}

/** A declared label written before a bar line, exactly, or a part's label, a dot and a line's name (grammar 7.6). */
function findLabel(word: string, declared: Part[]): Owner | null {
	const match = (w: string) =>
		declared.find((p) => p.label?.toLowerCase() === w.toLowerCase())?.label;
	const exact = match(word);
	if (exact) return { part: exact };
	const dot = word.lastIndexOf(".");
	const label = dot > 0 ? match(word.slice(0, dot)) : undefined;
	return label ? { part: label, lineName: word.slice(dot + 1) } : null;
}

type Owner = { part: string; lineName?: string };

/** The word before a bar line, whether a space follows it, and the bar line. */
function splitLabel(t: string): { word: string; space: boolean; rest: string } | null {
	const m = LABELLED.exec(t);
	return m ? { word: m[1] ?? "", space: Boolean(m[2]), rest: m[3] ?? "" } : null;
}
const LINE_NAME = /^[A-Za-z0-9]+$/;

/** A label and the bar line after it: `Gtr | G |` (grammar 7.4). */
/** Three or more hyphens alone: `---` ends a system (grammar 1, 7.4). */
const BREAK = /^-{3,}$/;
const LABELLED = /^([^\s|]+)(\s*)(\|.*)$/;

const readsCleanly = (barLine: string) => {
	const read = parseBarLine(barLine, 0);
	return Boolean(read.bars) && read.diagnostics.length === 0;
};

/** `G | C | D |`: a bar line with its leading pipe left off. */
function missingPipe(text: string, line: number): ChartDiagnostic | null {
	const fixed = `| ${text}`;
	if (!readsCleanly(fixed)) return null;
	return {
		line,
		severity: "warning",
		message: "a bar line starts with |",
		token: text,
		suggestion: fixed,
	};
}

/** A warning when a word before a clean bar line is not a declared part (grammar 7.4). */
function undeclaredLabel(text: string, line: number): ChartDiagnostic | null {
	const m = LABELLED.exec(text);
	if (!m?.[1] || !m[3]) return null;
	if (parseChord(m[1]).ok) return missingPipe(text, line);
	if (!readsCleanly(m[3])) return null;
	return {
		line,
		severity: "warning",
		message: `${m[1]} is not a part of this chart; declare it with part: ${m[1]} = …`,
		token: m[1],
	};
}

/** A warning when a text line looks like an older chart format. */
function oldFormat(text: string, line: number): ChartDiagnostic | null {
	const warn = (message: string, suggestion: string): ChartDiagnostic => ({
		line,
		severity: "warning",
		message,
		token: text,
		suggestion,
	});
	const label = /^\[([^\]]+)\]$/.exec(text) ?? /^([A-Za-z][\w ]*):$/.exec(text);
	if (label?.[1])
		return warn("a section label; barmark headings start with ##", `## ${label[1].trim()}`);
	const credit = nearCredit(text, line);
	if (credit) return credit;
	const directive = nearDirective(text);
	if (directive) return warn(directive.message, directive.suggestion);
	const undeclared = undeclaredLabel(text, line);
	if (undeclared) return undeclared;
	const unescaped = escapedBarLine(text);
	if (unescaped) return warn("escaped pipes; a bar line uses a plain |", unescaped);
	const words = text.split(/\s+/);
	if (words.length >= 2 && words.every((w) => parseChord(w).ok))
		return warn("chords outside a bar line are text", `| ${words.join(" | ")} |`);
	return null;
}

/** A misnamed directive (`meter:`), or `title:` for the `#` title (Kevin's ruling, 2026-11-07). */
function nearDirective(text: string): { message: string; suggestion: string } | null {
	const near = /^(\w+)\s*:\s*(.*)$/.exec(text);
	const [, word = "", value = ""] = near ?? [];
	if (word.toLowerCase() === "title" && value)
		return { message: "not a directive; a title is a # heading", suggestion: `# ${value}` };
	// Own keys only: `constructor:` is not a directive's near miss.
	const name = Object.hasOwn(NEAR_DIRECTIVES, word.toLowerCase())
		? NEAR_DIRECTIVES[word.toLowerCase()]
		: undefined;
	if (!near || !name) return null;
	return { message: `not a directive; did you mean ${name}:?`, suggestion: `${name}: ${value}` };
}

/** `D \| A \|` (an editor's escaping) as the bar line it would be, if it reads cleanly. */
function escapedBarLine(text: string): string | null {
	if (!text.includes("\\|")) return null;
	let fixed = text.replaceAll("\\|", "|").trim();
	if (!fixed.startsWith("|")) fixed = `| ${fixed}`;
	if (!fixed.endsWith("|")) fixed = `${fixed} |`;
	const read = parseBarLine(fixed, 0);
	return read.bars && read.diagnostics.length === 0 ? fixed : null;
}

/** A chart whose text holds no bar line at all says so, rather than looking empty. */
function noBarLines(lines: Line[]): ChartDiagnostic | null {
	if (lines.some((l) => l.kind === "bars" || l.kind === "invalid")) return null;
	const first = lines.find((l) => l.kind === "text" && !l.escaped);
	if (first?.kind !== "text") return null;
	return {
		line: first.line,
		severity: "warning",
		message: "no bar lines in this chart; a bar line starts with |",
		token: first.text,
	};
}

/** A part's bare line in a single-part chart with no lines is unlabelled, as before (grammar 7.4). */
function unlabelled(l: Line): Line {
	if (l.kind !== "bars" && l.kind !== "invalid") return l;
	const { part: _p, ...rest } = l;
	return rest;
}

/** Systems and part lines, when the chart has several parts or a part writes lines (grammar 7.4, 7.6). */
function groupParts(
	lines: Line[],
	parts: Part[],
): { lines: Line[]; parts: DeclaredPart[]; diagnostics: ChartDiagnostic[] } {
	const lined = lines.some(
		(l) => (l.kind === "bars" || l.kind === "invalid") && l.lineName !== undefined,
	);
	if (parts.length < 2 && !lined) return { lines: lines.map(unlabelled), parts, diagnostics: [] };
	const systems = groupSystems(lines);
	const checked = checkLines(systems.lines, parts);
	return { ...checked, diagnostics: [...systems.diagnostics, ...checked.diagnostics] };
}

/** Classify every line of a chart: title, sections, directives, bar lines and text. */
export function readDocument(text: string): {
	title: string | null;
	part: DeclaredPart | null;
	parts: DeclaredPart[];
	credits: Credits;
	lines: Line[];
	diagnostics: ChartDiagnostic[];
} {
	const lines: Line[] = [];
	const diagnostics: ChartDiagnostic[] = [];
	let title: string | null = null;
	/** The line kept as text, with why it isn't what it looks like. */
	const asText = (
		t: string,
		line: number,
		severity: "error" | "warning",
		message: string,
	): Line => {
		diagnostics.push({ line, severity, message, token: t });
		return { kind: "text", line, text: t };
	};
	const titleLine = (t: string, line: number): Line => {
		if (title !== null) return asText(t, line, "warning", "a chart has one title; this is text");
		title = t.slice(2).trim();
		return { kind: "title", line, text: title };
	};
	/** A `part:` line names the chart once, before its first bar (grammar 7.3). */
	const partLine = (read: Part | string, t: string, line: number): Line => {
		if (typeof read === "string") return asText(t, line, "error", read);
		if (lines.some((l) => l.kind === "bars" || l.kind === "invalid"))
			return asText(t, line, "error", "part: names the whole chart; put it before the first bar");
		return { kind: "part", line, ...read };
	};
	const otherLine = (t: string, line: number): Line => {
		const credit = readCredit(t, line, diagnostics);
		if (credit) return credit;
		const read = readPart(t);
		if (read) return partLine(read, t, line);
		const directive = parseDirectiveLine(t, line);
		if (directive) {
			diagnostics.push(...directive.diagnostics);
			return { kind: "directive", line, set: directive.set };
		}
		const old = oldFormat(t, line);
		if (old) diagnostics.push(old);
		return { kind: "text", line, text: t };
	};
	const barLine = (t: string, line: number): Line => {
		const r = parseBarLine(t, line);
		diagnostics.push(...r.diagnostics);
		return r.bars ?? { kind: "invalid", line, text: t, written: r.written };
	};
	const declaredParts = () =>
		lines.filter((l): l is Extract<Line, { kind: "part" }> => l.kind === "part");
	/** A labelled line that can't be read: no space before its pipe, or a bad line name. */
	const badLabel = (t: string, line: number, word: string, rest: string, owner: Owner): Line => {
		const space = t.length > word.length + rest.length;
		diagnostics.push({
			line,
			severity: "error",
			message: space ? "a line name is letters and digits" : "a space goes between the label and |",
			token: t,
			...(!space && { suggestion: `${word} ${rest}` }),
		});
		return { kind: "invalid", line, text: t, written: parseBarLine(rest, line).written, ...owner };
	};
	/** A declared part's bar line, or one of its lines (`Pno.RH`, grammar 7.6). */
	const labelledLine = (t: string, line: number): Line | null => {
		const split = splitLabel(t);
		const owner = split && findLabel(split.word, declaredParts());
		if (!split || !owner) return null;
		const { word, space, rest } = split;
		if (!space || !LINE_NAME.test(owner.lineName ?? "X"))
			return badLabel(t, line, word, rest, owner);
		const read = barLine(rest, line);
		return read.kind === "bars" || read.kind === "invalid" ? { ...read, ...owner } : read;
	};
	/** A leading `\` makes the rest text, whatever it looks like (grammar 1). */
	const escapedLine = (t: string, line: number): Line => {
		const text = t.slice(1);
		const old = oldFormat(text, line);
		if (old) diagnostics.push(old);
		return { kind: "text", line, text, escaped: true };
	};
	/** `lyrics:` or `lyrics N:` then a bar line (grammar 7.7); one with an error stays text. */
	const lyricRow = (t: string, line: number): Line | null => {
		const read = readLyricRow(t, line);
		diagnostics.push(...read.diagnostics);
		if (read.row || read.diagnostics.length) return read.row ?? { kind: "text", line, text: t };
		return null;
	};
	const classify = (t: string, line: number): Line => {
		if (BREAK.test(t)) return { kind: "break", line };
		if (t.startsWith("\\")) return escapedLine(t, line);
		if (t.startsWith("|")) return barLine(t, line);
		const row = lyricRow(t, line);
		if (row) return row;
		const labelled = labelledLine(t, line);
		if (labelled) return labelled;
		if (t.startsWith("# ")) return titleLine(t, line);
		if (t === "##" || t.startsWith("## ")) return readHeading(t.slice(2), line, diagnostics);
		return otherLine(t, line);
	};
	text
		.replace(/^\uFEFF/, "")
		.split(/\r?\n/)
		.forEach((raw, i) => {
			const t = raw.trim();
			if (t && !t.startsWith("```")) lines.push(classify(t, i + 1));
		});
	const empty = noBarLines(lines);
	if (empty) diagnostics.push(empty);
	const read = checkParts(lines, diagnostics);
	const grouped = groupParts(lines, read);
	const lyrics = attachLyrics(grouped.lines);
	diagnostics.push(...grouped.diagnostics, ...lyrics.diagnostics);
	const { parts } = grouped;
	return {
		title,
		part: parts.length === 1 ? (parts[0] ?? null) : null,
		parts,
		credits: creditsOf(lines),
		lines: lyrics.lines,
		diagnostics,
	};
}
