import { parseChord } from "../chords/parse.js";
import { misplacedRepeat, parseBarLine, readRepeat, repeatTail } from "./barLine.js";
import { parseDirectiveLine } from "./directives.js";
import type { ChartDiagnostic, Line, Repeat } from "./types.js";

const NEAR_DIRECTIVES: Record<string, string> = {
	meter: "time",
	signature: "time",
	bpm: "tempo",
	groove: "feel",
};

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
	lines: Line[];
	diagnostics: ChartDiagnostic[];
} {
	const lines: Line[] = [];
	const diagnostics: ChartDiagnostic[] = [];
	let title: string | null = null;
	const physical = text.replace(/^﻿/, "").split(/\r?\n/);
	physical.forEach((raw, i) => {
		const line = i + 1;
		const t = raw.trim();
		if (!t || t.startsWith("```")) return;
		if (t.startsWith("|")) {
			const r = parseBarLine(t, line);
			diagnostics.push(...r.diagnostics);
			lines.push(r.bars ?? { kind: "invalid", line, text: t });
			return;
		}
		if (t.startsWith("# ")) {
			if (title === null) {
				title = t.slice(2).trim();
				lines.push({ kind: "title", line, text: title });
				return;
			}
			diagnostics.push({
				line,
				severity: "warning",
				message: "a chart has one title; this is text",
				token: t,
			});
			lines.push({ kind: "text", line, text: t });
			return;
		}
		if (t === "##" || t.startsWith("## ")) {
			lines.push(readHeading(t.slice(2), line, diagnostics));
			return;
		}
		const directive = parseDirectiveLine(t, line);
		if (directive) {
			diagnostics.push(...directive.diagnostics);
			lines.push({ kind: "directive", line, set: directive.set });
			return;
		}
		const old = oldFormat(t, line);
		if (old) diagnostics.push(old);
		lines.push({ kind: "text", line, text: t });
	});
	const empty = noBarLines(lines);
	if (empty) diagnostics.push(empty);
	return { title, lines, diagnostics };
}
