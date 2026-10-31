import type { ChartDiagnostic, Directives, Feel, Key, Meter, Mode } from "./types.js";

export const DIRECTIVE_NAMES = ["key", "time", "tempo", "feel"] as const;
type Name = (typeof DIRECTIVE_NAMES)[number];

const MODES: Mode[] = [
	"major",
	"minor",
	"ionian",
	"dorian",
	"phrygian",
	"lydian",
	"mixolydian",
	"aeolian",
	"locrian",
];
const FEELS: Feel[] = ["straight", "swing", "shuffle", "swing 16"];

/** `n/d` with n from 1 to 32 and d in 2, 4, 8, 16. */
export function parseMeter(text: string): Meter | null {
	const m = /^(\d{1,2})\/(\d{1,2})$/.exec(text.trim());
	if (!m) return null;
	const n = Number(m[1]);
	const d = Number(m[2]);
	if (n < 1 || n > 32 || ![2, 4, 8, 16].includes(d)) return null;
	return { n, d };
}

/** Beats per bar: compound meters (6/8, 9/8, 12/8) count dotted quarters. */
export function beatsOf(m: Meter): number {
	return m.d === 8 && [6, 9, 12].includes(m.n) ? m.n / 3 : m.n;
}

function parseKey(text: string): Key | null {
	const m = /^([A-G])([#b♯♭]?)(m|\s+([A-Za-z]+))?$/.exec(text);
	if (!m) return null;
	const tonic = `${m[1]}${(m[2] ?? "").replace("♯", "#").replace("♭", "b")}`;
	if (m[3] === "m") return { tonic, mode: "minor" };
	if (m[4] === undefined) return { tonic, mode: "major" };
	const mode = m[4].toLowerCase() as Mode;
	return MODES.includes(mode) ? { tonic, mode } : null;
}

function parseTempo(text: string): number | null {
	const m = /^(\d+(?:\.\d+)?)(?:\s*bpm)?$/i.exec(text);
	const n = m ? Number(m[1]) : 0;
	return n > 0 ? n : null;
}

function parseFeel(text: string): Feel | null {
	const lower = text.toLowerCase();
	return FEELS.find((f) => f === lower) ?? null;
}

/**
 * A directive line: one or more `name: value` parts separated by commas.
 * Returns null when the line does not start with a directive name and a colon.
 */
export function parseDirectiveLine(
	text: string,
	line: number,
): { set: Directives; diagnostics: ChartDiagnostic[] } | null {
	const head = /^(\w+)\s*:/.exec(text.trim());
	if (!head || !DIRECTIVE_NAMES.includes(head[1]?.toLowerCase() as Name)) return null;
	const set: Directives = {};
	const diagnostics: ChartDiagnostic[] = [];
	const error = (message: string, token: string) =>
		diagnostics.push({ line, severity: "error", message, token });
	for (const part of text.split(",").map((p) => p.trim())) {
		const m = /^(\w+)\s*:\s*(.*)$/.exec(part);
		const name = m?.[1]?.toLowerCase() as Name | undefined;
		const value = m?.[2]?.trim() ?? "";
		if (!m || !name || !DIRECTIVE_NAMES.includes(name)) {
			error("unknown directive (key, time, tempo, feel)", part);
			continue;
		}
		if (name === "key") {
			const key = parseKey(value);
			if (key) set.key = key;
			else error("key must be a root with optional m or a mode", value);
		} else if (name === "time") {
			const time = parseMeter(value);
			if (time) set.time = time;
			else error("time must be n/d with d of 2, 4, 8 or 16", value);
		} else if (name === "tempo") {
			const tempo = parseTempo(value);
			if (tempo) set.tempo = tempo;
			else error("tempo must be beats per minute", value);
		} else {
			const feel = parseFeel(value);
			if (feel) set.feel = feel;
			else error("feel must be straight, swing, shuffle or swing 16", value);
		}
	}
	return { set, diagnostics };
}
