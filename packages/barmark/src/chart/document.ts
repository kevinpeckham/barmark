import { parseChord } from "../chords/parse.js";
import { misplacedRepeat, parseBarLine, readRepeat, repeatTail } from "./barLine.js";
import { parseDirectiveLine } from "./directives.js";
import type { ChartDiagnostic, Line, Part, Repeat } from "./types.js";

const NEAR_DIRECTIVES: Record<string, string> = {
	meter: "time",
	signature: "time",
	bpm: "tempo",
	groove: "feel",
	instrument: "part",
	parts: "part",
};

const DIRECTIVE_AFTER = /,\s*(key|time|tempo|feel)\s*:/i;

/** A `part:` line's label and name, or why it has none (grammar 7.3). */
function readPart(text: string): Part | string | null {
	const m = /^part\s*:(.*)$/i.exec(text);
	if (!m) return null;
	const value = (m[1] ?? "").trim().replace(/\s+/g, " ");
	if (DIRECTIVE_AFTER.test(value))
		return "part: goes on a line of its own; the name runs to the end of the line";
	const labelled = /^([^\s=]*)\s*=\s*(.*)$/.exec(value);
	if (!labelled) return value ? { name: value } : "part: needs a name";
	const [, label, name] = labelled;
	if (!label) return "part: needs a label before =";
	if (/^[|#@0-9]/.test(label)) return "a part label can't start with |, #, @ or a digit";
	return name ? { label, name } : "part: needs a name after the label";
}

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

const partOf = (l: Part): Part => (l.label ? { label: l.label, name: l.name } : { name: l.name });

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

/** A label and the bar line after it: `Gtr | G |` (grammar 7.4). */
const LABELLED = /^([^\s|]+)(\s*)(\|.*)$/;

/** A warning when a word before a clean bar line is not a declared part (grammar 7.4). */
function undeclaredLabel(text: string, line: number): ChartDiagnostic | null {
	const m = LABELLED.exec(text);
	if (!m?.[1] || !m[3]) return null;
	const read = parseBarLine(m[3], 0);
	if (!read.bars || read.diagnostics.length > 0) return null;
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
	const near = /^(\w+)\s*:\s*(.*)$/.exec(text);
	const name = near?.[1] ? NEAR_DIRECTIVES[near[1].toLowerCase()] : undefined;
	if (near && name) return warn(`not a directive; did you mean ${name}:?`, `${name}: ${near[2]}`);
	const undeclared = undeclaredLabel(text, line);
	if (undeclared) return undeclared;
	const unescaped = escapedBarLine(text);
	if (unescaped) return warn("escaped pipes; a bar line uses a plain |", unescaped);
	const words = text.split(/\s+/);
	if (words.length >= 2 && words.every((w) => parseChord(w).ok))
		return warn("chords outside a bar line are text", `| ${words.join(" | ")} |`);
	return null;
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
	const first = lines.find((l) => l.kind === "text");
	if (first?.kind !== "text") return null;
	return {
		line: first.line,
		severity: "warning",
		message: "no bar lines in this chart; a bar line starts with |",
		token: first.text,
	};
}

/** Classify every line of a chart: title, sections, directives, bar lines and text. */
export function readDocument(text: string): {
	title: string | null;
	part: Part | null;
	parts: Part[];
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
	/** A declared part's bar line; labelled only when the chart has several parts. */
	const labelledLine = (t: string, line: number): Line | null => {
		const m = LABELLED.exec(t);
		const declared = lines.filter((l) => l.kind === "part");
		const found = declared.find((p) => p.label?.toLowerCase() === m?.[1]?.toLowerCase());
		if (!m || !found?.label) return null;
		const [, word = "", space, rest = ""] = m;
		if (!space) {
			diagnostics.push({
				line,
				severity: "error",
				message: "a space goes between the label and |",
				token: t,
				suggestion: `${word} ${rest}`,
			});
			const written = parseBarLine(rest, line).written;
			return {
				kind: "invalid",
				line,
				text: t,
				written,
				...(declared.length > 1 && { part: found.label }),
			};
		}
		const read = barLine(rest, line);
		if (declared.length < 2 || (read.kind !== "bars" && read.kind !== "invalid")) return read;
		return { ...read, part: found.label };
	};
	const classify = (t: string, line: number): Line => {
		if (t.startsWith("|")) return barLine(t, line);
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
	const parts = checkParts(lines, diagnostics);
	return { title, part: parts.length === 1 ? (parts[0] ?? null) : null, parts, lines, diagnostics };
}
