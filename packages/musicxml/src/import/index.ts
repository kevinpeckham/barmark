/**
 * `importMusicXml`: a MusicXML score as a barmark chart, and what the chart
 * couldn't carry over. The pipeline reads the XML, the score, each part,
 * then the structure, and writes the chart; it never throws.
 */
import { type ImportDiagnostic, Losses, measuresText } from "./losses.js";
import type { Words } from "./lyrics.js";
import { barsOf, importPart, linesOf } from "./parts.js";
import { type ReadPart, type ReadScore, readScore, reportMeters } from "./read.js";
import { readStructure } from "./structure.js";
import { readXml } from "./tree.js";
import { staffWords } from "./voice.js";
import { writeChart } from "./write.js";

export type ImportOptions = {
	/** One part to import alone, by its name, abbreviation or id (any case): its notes come in as note sets even when the file has no chord symbols. */
	part?: string;
};

export type ImportResult = { text: string; diagnostics: ImportDiagnostic[] };

const fold = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

/** The part `--part` names, else null with an error listing the parts. */
function chosen(score: ReadScore, name: string, losses: Losses): ReadPart | null {
	const wanted = fold(name);
	const found = score.parts.find((p) =>
		[p.name, p.abbreviation ?? "", p.id].some((n) => n !== "" && fold(n) === wanted),
	);
	if (!found)
		losses.note({
			severity: "error",
			message: `no part named ${name}; the parts are: ${score.parts.map((p) => p.name).join(", ")}`,
		});
	return found ?? null;
}

const hasNotes = (p: ReadPart) =>
	p.measures.some((m) => m.lines.some((l) => l.some((a) => a.kind === "notes")));

/** Why nothing came in: no chord symbols (with any words that look like them), and the parts whose notes `--part` could import. */
function noChords(score: ReadScore, losses: Losses): void {
	const named = score.parts.filter(hasNotes).map((p) => p.name);
	if (named.length === 0) {
		losses.note({ severity: "error", message: "nothing to import: no chord symbols and no notes" });
		return;
	}
	// The structure is read only for its chord-like words; its other losses don't apply.
	const measures = readStructure(score, new Losses()).chordWords;
	const words =
		measures.length === 0
			? ""
			: `text that looks like chord symbols in ${measuresText(measures)} (the program exported them as text); `;
	const error: ImportDiagnostic = {
		severity: "error",
		message: `no chord symbols; ${words}these parts have notes: ${named.join(", ")}. Import one as note sets with --part`,
	};
	if (measures[0] !== undefined) {
		error.measure = measures[0];
		error.measures = measures;
	}
	losses.note(error);
}

/** Parts of notes alone, left out beside parts with chords, named with the `--part` that imports one. */
function leftOut(parts: ReadPart[], losses: Losses): void {
	if (parts.length === 0) return;
	const names = parts.map((p) => p.name).join(", ");
	losses.note({
		severity: "warning",
		message: `no chord symbols in these parts, left out: ${names}. Import one as note sets with --part`,
	});
}

/** The words of a lyric row's staff (`<?barmark lyrics?>`), which comes in as lyric rows, not a part. */
function staffOf(score: ReadScore): Words | null {
	const staff = score.parts.find((p) => p.lyricStaff);
	return staff ? staffWords(linesOf(staff)[0] ?? [], barsOf(staff)) : null;
}

/** The parts to import: the one `--part` names, else all but a lyric staff; null when there is nothing to import. */
function partsOf(score: ReadScore, options: ImportOptions, losses: Losses): ReadPart[] | null {
	if (options.part === undefined) return score.parts.filter((p) => !p.lyricStaff);
	const part = chosen(score, options.part, losses);
	if (part && !hasNotes(part) && !part.measures.some((m) => m.harmonies.length > 0)) {
		losses.note({ severity: "error", message: `${part.name} has no chord symbols or notes` });
		return null;
	}
	return part ? [part] : null;
}

function run(xml: string, options: ImportOptions, losses: Losses): string {
	const root = readXml(xml);
	if (typeof root === "string") {
		losses.note({ severity: "error", message: root });
		return "";
	}
	const score = readScore(root, losses);
	if (!score) return "";
	const barmark = score.software?.startsWith("@barmark/musicxml") ?? false;
	const chosenParts = partsOf(score, options, losses);
	if (!chosenParts) return "";
	const forced = options.part !== undefined;
	const imported = chosenParts.map((p) => importPart(p, { barmark, forced }, losses));
	const parts = imported.flatMap((p) => p ?? []);
	if (parts.length === 0) {
		noChords(score, losses);
		return "";
	}
	leftOut(
		chosenParts.filter((p, i) => imported[i] === null && hasNotes(p)),
		losses,
	);
	// A part left out reports no losses.
	reportMeters(
		chosenParts.filter((_, i) => imported[i] !== null),
		losses,
	);
	// With --part, words on the bars, text lines and lyrics come from the chosen part
	// alone; the score's structure (headings, tempo, repeats) from every part.
	const scoped = forced ? { ...score, parts: chosenParts } : score;
	const words = forced ? new Set(chosenParts) : undefined;
	const staff = forced ? null : staffOf(score);
	return writeChart(scoped, parts, readStructure(score, losses, words), losses, staff);
}

/**
 * The chart a MusicXML document holds, canonical as `barmark format` prints
 * it, and the diagnostics: what was left out, approximated or written as
 * `?`. Never throws: a file that gives nothing returns an empty `text` and
 * an error.
 */
export function importMusicXml(xml: string, options: ImportOptions = {}): ImportResult {
	const losses = new Losses();
	try {
		const text = run(xml, options, losses);
		return { text, diagnostics: losses.list() };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { text: "", diagnostics: [{ severity: "error", message: `importer bug: ${message}` }] };
	}
}
