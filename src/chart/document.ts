import { parseChord } from "../chords/parse.js";
import { parseBarLine, readRepeat } from "./barLine.js";
import { parseDirectiveLine } from "./directives.js";
import type { ChartDiagnostic, Line, Repeat } from "./types.js";

const HEADING_REPEAT = /(?:^|\s+)x\s*(\d+|\.\.\.|…)$/;
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
	const tail = HEADING_REPEAT.exec(rest);
	if (tail) {
		repeat = readRepeat(tail[1] ?? "", line, diagnostics);
		rest = rest.slice(0, tail.index).trim();
	}
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
	const words = text.split(/\s+/);
	if (words.length >= 2 && words.every((w) => parseChord(w).ok))
		return warn("chords outside a bar line are text", `| ${words.join(" | ")} |`);
	return null;
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
			if (r.bars) lines.push(r.bars);
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
		if (t.startsWith("## ")) {
			lines.push(readHeading(t.slice(3), line, diagnostics));
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
	return { title, lines, diagnostics };
}
