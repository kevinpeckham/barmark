/** Chord symbols as MusicXML <harmony>: a kind, plus degrees that spell the exact chord. */
import type { ChordRecord, Interval, SimpleSlot } from "barmark";
import { KINDS } from "./kinds.js";
import { el, text } from "./xml.js";

export type Degree = { value: number; alter: number; type: "add" | "alter" | "subtract" };

/** MusicXML writes an added degree's alteration from a dominant chord: the 7 is minor. */
const addBase = (degree: number) => (degree === 7 ? -1 : 0);

/** The degrees that turn `kind`'s intervals into `chord`'s. */
function diff(kind: Interval[], chord: Interval[]): Degree[] {
	const same = (a: Interval, b: Interval) => a.degree === b.degree && a.alter === b.alter;
	const leftK = kind.filter((k) => !chord.some((c) => same(c, k)));
	const leftC = chord.filter((c) => !kind.some((k) => same(c, k)));
	const out: Degree[] = [];
	for (const k of leftK) {
		const i = leftC.findIndex((c) => c.degree === k.degree);
		const moved = i >= 0 ? leftC.splice(i, 1)[0] : undefined;
		out.push(
			moved
				? { value: k.degree, alter: moved.alter - k.alter, type: "alter" }
				: { value: k.degree, alter: 0, type: "subtract" },
		);
	}
	for (const c of leftC)
		out.push({ value: c.degree, alter: c.alter - addBase(c.degree), type: "add" });
	return out;
}

/** The kind needing the fewest degrees to spell the chord (ties: the earlier, commoner kind). */
export function kindOf(intervals: Interval[]): { kind: string; degrees: Degree[] } {
	let best = { kind: "other", degrees: [] as Degree[] };
	let cost = Number.POSITIVE_INFINITY;
	for (const k of KINDS) {
		if (!k.intervals) continue;
		const degrees = diff(k.intervals, intervals);
		if (degrees.length < cost) {
			best = { kind: k.kind, degrees };
			cost = degrees.length;
		}
	}
	return best;
}

/** The intervals a kind and its degrees spell: what a program reading the harmony plays. */
export function intervalsOf(kind: string, degrees: Degree[]): Interval[] {
	const out = [...(KINDS.find((k) => k.kind === kind)?.intervals ?? [])];
	for (const d of degrees) {
		const i = out.findIndex((x) => x.degree === d.value);
		const at = out[i];
		if (d.type === "add") out.push({ degree: d.value, alter: addBase(d.value) + d.alter });
		else if (at && d.type === "alter") out[i] = { degree: d.value, alter: at.alter + d.alter };
		else if (at) out.splice(i, 1);
	}
	return out;
}

/** A note name's letter and alteration: "F#" is F, 1. */
function spell(name: string): { step: string; alter: number } {
	const alter = [...name.slice(1)].reduce((a, c) => a + (c === "#" ? 1 : c === "b" ? -1 : 0), 0);
	return { step: name[0] ?? "C", alter };
}

function pitchXml(prefix: "root" | "bass", name: string): string {
	const { step, alter } = spell(name);
	return el(prefix, {}, [
		text(`${prefix}-step`, step),
		alter ? text(`${prefix}-alter`, alter) : "",
	]);
}

/** barmark's own spelling of the quality: the canonical symbol without its root and slash bass. */
function qualityText(record: ChordRecord): string {
	const root = record.root ?? "";
	const bass = record.parts?.bass;
	const rest = record.canonical.slice(root.length);
	return bass && rest.endsWith(`/${bass}`) ? rest.slice(0, -bass.length - 1) : rest;
}

const degreeXml = (d: Degree) =>
	el("degree", {}, [
		text("degree-value", d.value),
		text("degree-alter", d.alter),
		text("degree-type", d.type),
	]);

/** A chord symbol's <harmony>. */
export function harmonyXml(record: ChordRecord): string {
	const { kind, degrees } = kindOf(record.intervals);
	const bass = record.parts?.bass;
	return el("harmony", {}, [
		pitchXml("root", record.root ?? "C"),
		text("kind", kind, { text: qualityText(record) }),
		bass ? pitchXml("bass", bass) : "",
		...degrees.map(degreeXml),
	]);
}

/** N.C.: kind none, its required root hidden by an empty text. */
export const noChordXml = () =>
	el("harmony", {}, [
		el("root", {}, text("root-step", "C", { text: "" })),
		text("kind", "none", { text: "N.C." }),
	]);

/** The chord symbol a slot names, if it names one: a chord, or N.C. */
export function slotHarmonyXml(slot: SimpleSlot): string {
	if (slot.kind === "nc") return noChordXml();
	return slot.kind === "chord" && slot.chord.kind === "chord" ? harmonyXml(slot.chord) : "";
}
