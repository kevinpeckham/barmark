/** Shared by the import tests: wrap measures in a score, read it, build notes. */
import { type ImportDiagnostic, Losses } from "../../src/import/losses.js";
import {
	type ReadMeasure,
	type ReadPart,
	type ReadScore,
	readScore,
	reportMeters,
} from "../../src/import/read.js";
import { parseXml } from "../../src/import/tree.js";

const DOCTYPE =
	'<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';

/** A one-part `score-partwise` around the measures written in the template. */
export function xml(strings: TemplateStringsArray, ...values: unknown[]): string {
	const body = strings.reduce((out, s, i) => out + s + String(values[i] ?? ""), "");
	return `<?xml version="1.0" encoding="UTF-8"?>\n${DOCTYPE}\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}

/** What reading a document gives: the score (null when it could not be read) and its diagnostics. */
export function read(text: string): { score: ReadScore | null; diagnostics: ImportDiagnostic[] } {
	const losses = new Losses();
	const root = parseXml(text);
	const score = root ? readScore(root, losses) : null;
	if (score) reportMeters(score.parts, losses);
	return { score, diagnostics: losses.list() };
}

/** The first part's measures, read from the measures written in the template. */
export function measuresOf(text: string): ReadMeasure[] {
	return partOf(text).measures;
}

export function partOf(text: string): ReadPart {
	const part = read(text).score?.parts[0];
	if (!part) throw new Error("no part read");
	return part;
}

/** A pitched note; `extra` goes after the duration. */
export const note = (step: string, octave: number, duration: number, extra = "", alter = 0) =>
	`<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch><duration>${duration}</duration>${extra}</note>`;

export const rest = (duration: number, extra = "") =>
	`<note><rest/><duration>${duration}</duration>${extra}</note>`;

export const attributes = (inner: string) => `<attributes>${inner}</attributes>`;

export const measure = (number: number | string, inner: string, attrs = "") =>
	`<measure number="${number}"${attrs}>${inner}</measure>`;
