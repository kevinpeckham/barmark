import { DIRECTIVE_AFTER } from "./directives.js";
import type { ChartDiagnostic, CreditRole, Credits, Line } from "./types.js";

/** The credit roles, in the order MusicXML writes them (grammar 7.5). */
export const CREDIT_ROLES: readonly CreditRole[] = [
	"composer",
	"lyricist",
	"arranger",
	"copyright",
];

const NEAR_CREDITS: Record<string, CreditRole> = {
	author: "composer",
	writer: "composer",
	music: "composer",
	words: "lyricist",
	lyrics: "lyricist",
	arr: "arranger",
	arranged: "arranger",
	rights: "copyright",
	"©": "copyright",
};

/** A credit line, or null when the line isn't one (grammar 7.5). */
export function readCredit(
	text: string,
	line: number,
	diagnostics: ChartDiagnostic[],
): Line | null {
	const m = /^(composer|lyricist|arranger|copyright)\s*:(.*)$/i.exec(text);
	if (!m) return null;
	const role = (m[1] ?? "").toLowerCase() as CreditRole;
	const value = (m[2] ?? "").trim().replace(/\s+/g, " ");
	if (!value) {
		diagnostics.push({ line, severity: "error", message: `${role}: needs a value`, token: text });
		return { kind: "text", line, text };
	}
	const after = DIRECTIVE_AFTER.exec(value);
	if (after)
		diagnostics.push({
			line,
			severity: "warning",
			message: `a credit runs to the end of the line; put ${after[1]?.toLowerCase()}: on its own line`,
			token: text,
		});
	return { kind: "credit", line, role, text: value };
}

/** A text line that reads like a credit under another name: `author: X`. */
export function nearCredit(text: string, line: number): ChartDiagnostic | null {
	const m = /^([^\s:]+)\s*:\s*(.*)$/.exec(text);
	const role = m?.[1] ? NEAR_CREDITS[m[1].toLowerCase()] : undefined;
	if (!m || !role) return null;
	return {
		line,
		severity: "warning",
		message: `not a credit; did you mean ${role}:?`,
		token: text,
		...(m[2] && { suggestion: `${role}: ${m[2]}` }),
	};
}

/** Every credit line's text, by role, in written order. */
export function creditsOf(lines: Line[]): Credits {
	const credits: Credits = { composer: [], lyricist: [], arranger: [], copyright: [] };
	for (const l of lines) if (l.kind === "credit") credits[l.role].push(l.text);
	return credits;
}
