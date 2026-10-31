import type { Cell, Directives, Key, Line, Repeat, SimpleSlot, Slot } from "./types.js";

/** A slot with no attack of its own continues whatever sounds before it. A repeated chord name is a re-attack. */
function continues(sounding: SimpleSlot | null, s: Slot): boolean {
	if (s.kind === "hold") return true;
	if (s.kind === "silence" || s.kind === "nc") return sounding?.kind === s.kind;
	return false;
}

/** The fewest slots with the same timeline: `G / D /` is `G D`, `-- --` is `--`. */
export function reduceSlots(slots: Slot[]): Slot[] {
	const k = slots.length;
	const cont: boolean[] = [];
	let sounding: SimpleSlot | null = null;
	for (const s of slots) {
		cont.push(continues(sounding, s));
		const last = s.kind === "group" ? s.members.at(-1) : s;
		if (last && last.kind !== "hold") sounding = last;
	}
	for (let m = 1; m <= k; m++) {
		if (k % m !== 0) continue;
		const size = k / m;
		if (cont.every((c, i) => i % size === 0 || c)) return slots.filter((_, i) => i % size === 0);
	}
	return slots;
}

const SYMBOLS = { hold: "/", nc: "N.C.", silence: "--", unknown: "?" } as const;

function printSimple(s: SimpleSlot): string {
	return s.kind === "chord" ? s.chord.canonical : SYMBOLS[s.kind];
}

/** A slot in canonical spelling; a group's members are joined with `_`. */
export function printSlot(s: Slot): string {
	return s.kind === "group" ? s.members.map(printSimple).join("_") : printSimple(s);
}

/** A cell in canonical form: `%`, `...`, or an optional `[n/d]` and the fewest slots. */
export function printCell(c: Cell): string {
	if (c.kind === "simile") return "%";
	if (c.kind === "fermata") return "...";
	const meter = c.meter ? `[${c.meter.n}/${c.meter.d}] ` : "";
	return meter + reduceSlots(c.slots).map(printSlot).join(" ");
}

const printRepeat = (r: Repeat) => (r === null ? "" : r === "open" ? " x ..." : ` x${r}`);

function printKey(k: Key): string {
	if (k.mode === "major") return k.tonic;
	if (k.mode === "minor") return `${k.tonic}m`;
	return `${k.tonic} ${k.mode}`;
}

function printDirectives(d: Directives): string {
	const parts: string[] = [];
	if (d.key) parts.push(`key: ${printKey(d.key)}`);
	if (d.time) parts.push(`time: ${d.time.n}/${d.time.d}`);
	if (d.tempo !== undefined) parts.push(`tempo: ${d.tempo}`);
	if (d.feel) parts.push(`feel: ${d.feel}`);
	return parts.join(", ");
}

/** One parsed line in canonical form. Text and invalid lines print as stored. */
export function printLine(l: Line): string {
	switch (l.kind) {
		case "title":
			return `# ${l.text}`;
		case "section":
			return `## ${l.name.replace(/\s+/g, " ")}${printRepeat(l.repeat)}${l.elided ? " ->" : ""}`;
		case "directive":
			return printDirectives(l.set);
		case "bars":
			return `${l.opens ? "|:" : "|"} ${l.cells.map(printCell).join(" | ")} ${l.closes ? ":|" : "|"}${printRepeat(l.repeat)}`;
		default:
			return l.text;
	}
}
