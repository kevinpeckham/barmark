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
	return name ? { label, name } : "part: needs a name after the label";
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
	lines: Line[];
	diagnostics: ChartDiagnostic[];
} {
	const lines: Line[] = [];
	const diagnostics: ChartDiagnostic[] = [];
	let title: string | null = null;
	let part: Part | null = null;
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
		if (part)
			return asText(
				t,
				line,
				"error",
				"a chart names one part; several parts are not supported yet",
			);
		part = read;
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
	const classify = (t: string, line: number): Line => {
		if (t.startsWith("|")) {
			const r = parseBarLine(t, line);
			diagnostics.push(...r.diagnostics);
			return r.bars ?? { kind: "invalid", line, text: t, written: r.written };
		}
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
	return { title, part, lines, diagnostics };
}
