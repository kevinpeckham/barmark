/**
 * `importMusicXml`: a MusicXML score as a barmark chart, and what the chart
 * couldn't carry over. The pipeline reads the XML, the score, each part,
 * then the structure, and writes the chart; it never throws.
 */
import { type ImportDiagnostic, Losses } from "./losses.js";
import { importPart } from "./parts.js";
import { type ReadPart, type ReadScore, readScore } from "./read.js";
import { readStructure } from "./structure.js";
import { parseXml } from "./tree.js";
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

/** Why nothing came in: no chord symbols, and the parts whose notes `--part` could import. */
function noChords(score: ReadScore, losses: Losses): void {
	const named = score.parts.filter(hasNotes).map((p) => p.name);
	losses.note({
		severity: "error",
		message:
			named.length === 0
				? "nothing to import: no chord symbols and no notes"
				: `no chord symbols; these parts have notes: ${named.join(", ")}. Import one as note sets with --part`,
	});
}

function run(xml: string, options: ImportOptions, losses: Losses): string {
	const root = parseXml(xml);
	if (!root) {
		losses.note({ severity: "error", message: "not well-formed XML" });
		return "";
	}
	const score = readScore(root, losses);
	if (!score) return "";
	const barmark = score.software?.startsWith("@barmark/musicxml") ?? false;
	const forced = options.part !== undefined;
	const part = options.part === undefined ? null : chosen(score, options.part, losses);
	if (forced && !part) return "";
	const parts = (part ? [part] : score.parts).flatMap(
		(p) => importPart(p, { barmark, forced }, losses) ?? [],
	);
	if (parts.length === 0) {
		noChords(score, losses);
		return "";
	}
	return writeChart(score, parts, readStructure(score, losses), losses);
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
