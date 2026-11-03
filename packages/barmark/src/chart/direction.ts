import type { Direction, Line } from "./types.js";

/** Every direction in its canonical spelling (grammar 5.2). */
const SPELLINGS: [string, Direction][] = [
	["Segno", { kind: "segno" }],
	["Coda", { kind: "coda" }],
	["To Coda", { kind: "to coda" }],
	["Fine", { kind: "fine" }],
	["D.C.", { kind: "jump", to: "start", al: null }],
	["D.C. al Fine", { kind: "jump", to: "start", al: "fine" }],
	["D.C. al Coda", { kind: "jump", to: "start", al: "coda" }],
	["D.S.", { kind: "jump", to: "segno", al: null }],
	["D.S. al Fine", { kind: "jump", to: "segno", al: "fine" }],
	["D.S. al Coda", { kind: "jump", to: "segno", al: "coda" }],
];
/** The score's own signs, accepted on input. */
const SYMBOLS = new Map([
	["𝄋", "Segno"],
	["𝄌", "Coda"],
]);

const exact = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
/** Dots and spaces dropped: what a near miss still shares with the spelling. */
const loose = (text: string) => exact(text).replace(/[.\s]/g, "");
/** The words directions are made of, which a chord never is. */
const WORDS = new Set(["segno", "coda", "to", "fine", "dc", "ds", "al", "𝄋", "𝄌"]);

/** A cell's text as a direction, the spelling it nearly is, or neither. */
export function readDirection(
	cell: string,
): { direction: Direction } | { suggestion: string } | null {
	const text = SYMBOLS.get(cell.trim()) ?? cell;
	const hit = SPELLINGS.find(([s]) => exact(s) === exact(text));
	if (hit) return { direction: hit[1] };
	const near = SPELLINGS.find(([s]) => loose(s) === loose(text));
	return near ? { suggestion: near[0] } : null;
}

/** A slot token that belongs to a direction, which must have its cell to itself. */
export const isDirectionWord = (token: string) => WORDS.has(loose(token));

/** A direction in its canonical spelling. */
export function printDirection(d: Direction): string {
	const hit = SPELLINGS.find(
		([, s]) =>
			s.kind === d.kind &&
			(s.kind !== "jump" || (d.kind === "jump" && s.to === d.to && s.al === d.al)),
	);
	return hit?.[0] ?? "";
}

type Report = (line: number, message: string, token: string) => void;
type Mark = { line: number; cell: number; direction: Direction };
/** Where the one jump goes back to and where it ends. */
export type JumpPlan = { to: "start" | "segno"; al: "fine" | "coda" | null };

/** Whether `a` and `b` are both written, `a` first. */
const inOrder = (a: Mark | undefined, b: Mark | undefined) =>
	!!a && !!b && (a.line < b.line || (a.line === b.line && a.cell < b.cell));

/** Every direction in the chart, in written order. */
function marksOf(lines: Line[]): Mark[] {
	return lines.flatMap((l) =>
		l.kind === "bars"
			? l.cells.flatMap((c, cell) =>
					c.kind === "direction" ? [{ line: l.line, cell, direction: c.direction }] : [],
				)
			: [],
	);
}

/** What the jump needs and the chart lacks. */
function missingMarks(jump: Mark, plan: JumpPlan, first: Map<string, Mark>): string[] {
	const toCoda = first.get("to coda");
	const wants: [boolean, string][] = [
		[plan.to === "segno" && !inOrder(first.get("segno"), jump), "no Segno before it"],
		[plan.al === "fine" && !first.has("fine"), "no Fine"],
		[plan.al === "coda" && !toCoda, "no To Coda"],
		[
			plan.al === "coda" && !!toCoda && !inOrder(toCoda, first.get("coda")),
			"no Coda after its To Coda",
		],
	];
	const name = printDirection(jump.direction);
	return wants.filter(([missing]) => missing).map(([, what]) => `${name} has ${what}`);
}

/** The marks no jump uses: each is an error. */
function unusedMarks(plan: JumpPlan | null, first: Map<string, Mark>): Mark[] {
	const used: Record<string, boolean> = {
		segno: plan?.to === "segno",
		fine: plan?.al === "fine",
		"to coda": plan?.al === "coda",
		coda: plan?.al === "coda",
	};
	return [...first.values()].filter((m) => m.direction.kind !== "jump" && !used[m.direction.kind]);
}

/**
 * Check a chart's directions (grammar 5.2) and say where its jump goes.
 * A chart with a problem in its directions plays without the jump.
 */
export function planJump(lines: Line[], error: Report): JumpPlan | null {
	const problems: [Mark, string][] = [];
	const first = new Map<string, Mark>();
	for (const m of marksOf(lines)) {
		const kind = m.direction.kind;
		if (!first.has(kind)) first.set(kind, m);
		else if (kind === "jump") problems.push([m, "a chart has one D.C. or D.S.; this is a second"]);
		else problems.push([m, `a second ${printDirection(m.direction)}; a chart has one`]);
	}
	const jump = first.get("jump");
	const plan = jump?.direction.kind === "jump" ? jump.direction : null;
	if (jump && plan)
		problems.push(...missingMarks(jump, plan, first).map((m): [Mark, string] => [jump, m]));
	for (const m of unusedMarks(plan, first))
		problems.push([m, `${printDirection(m.direction)}: no jump uses it`]);
	for (const [m, message] of problems) error(m.line, message, printDirection(m.direction));
	return !problems.length && plan ? { to: plan.to, al: plan.al } : null;
}
