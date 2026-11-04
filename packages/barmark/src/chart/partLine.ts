import { DIRECTIVE_AFTER } from "./directives.js";
import {
	CLEF_NAMES,
	type ClefName,
	type InstrumentInfo,
	instrumentInfo,
	nearInstruments,
} from "./instruments.js";
import type { Part } from "./types.js";

type Attributes = Pick<Part, "instrument" | "clef">;

/** A `part:` line's label, name and attributes, or why it has none (grammar 7.3). */
export function readPart(text: string): Part | string | null {
	const m = /^part\s*:(.*)$/i.exec(text);
	if (!m) return null;
	const found = splitAttributes((m[1] ?? "").trim().replace(/\s+/g, " "));
	if (typeof found === "string") return found;
	const attributes = readAttributes(found.attributes);
	if (typeof attributes === "string") return attributes;
	const named = readName(found.value);
	return typeof named === "string" ? named : { ...named, ...attributes };
}

/** The label and name before any attributes. */
function readName(value: string): Part | string {
	if (DIRECTIVE_AFTER.test(value))
		return "part: goes on a line of its own; the name runs to the end of the line";
	const labelled = /^([^\s=]*)\s*=\s*(.*)$/.exec(value);
	if (!labelled) return value ? { name: value } : "part: needs a name";
	const [, label, name] = labelled;
	if (!label) return "part: needs a label before =";
	if (/^[|#@0-9]/.test(label)) return "a part label can't start with |, #, @ or a digit";
	return name ? { label, name } : "part: needs a name after the label";
}

const ATTRIBUTE = /,\s*(instrument|clef)\s*:\s*([^,]*)$/i;

/** `, instrument: …` and `, clef: …` peeled off the end of the line, in either order. */
function splitAttributes(
	text: string,
): { value: string; attributes: Map<string, string> } | string {
	let value = text;
	const attributes = new Map<string, string>();
	for (let m = ATTRIBUTE.exec(value); m; m = ATTRIBUTE.exec(value)) {
		const name = (m[1] ?? "").toLowerCase();
		if (attributes.has(name)) return `part: names its ${name} once`;
		attributes.set(name, (m[2] ?? "").trim());
		value = value.slice(0, m.index).trim();
	}
	return { value, attributes };
}

/** The instrument and clef written, each checked against its list. */
function readAttributes(written: Map<string, string>): Attributes | string {
	const instrument = readInstrument(written.get("instrument"));
	if (typeof instrument === "string") return instrument;
	const clef = written.get("clef")?.toLowerCase();
	if (clef === undefined) return instrument ? { instrument: instrument.name } : {};
	const problem = clefProblem(clef, instrument?.staves ?? 1);
	if (problem) return problem;
	return { ...(instrument && { instrument: instrument.name }), clef: clef as ClefName };
}

/** The listed instrument written, null when none is, or why it isn't one. */
function readInstrument(name: string | undefined): InstrumentInfo | null | string {
	if (name === undefined) return null;
	return instrumentInfo(name) ?? unknownInstrument(name);
}

function clefProblem(clef: string, staves: 1 | 2): string | null {
	if (!CLEF_NAMES.includes(clef as ClefName))
		return `${clef || "an empty clef"} is not a clef; write ${CLEF_NAMES.join(", ")}`;
	return staves === 2 ? "a keyboard has a treble and a bass staff; leave clef: out" : null;
}

function unknownInstrument(name: string): string {
	const near = nearInstruments(name);
	const hint = near.length ? `: did you mean ${near.join(" or ")}?` : "";
	return `${name || "an empty name"} is not an instrument barmark knows${hint}`;
}
