import { type JumpPlan, planJump } from "./direction.js";
import { beatsOf } from "./directives.js";
import { pedalWarnings } from "./pedal.js";
import { type Entry, type Item, pairRepeats } from "./repeats.js";
import { perWritten, slotTimes } from "./shares.js";
import type {
	ChartDiagnostic,
	ChartEvent,
	Direction,
	Directives,
	Feel,
	Key,
	Line,
	Meter,
	PlayedBar,
	Push,
	Repeat,
	SectionOccurrence,
	SimpleSlot,
	Slot,
	TempoChange,
	Words,
} from "./types.js";

/**
 * Where a played bar comes from, for its words (grammar 7.7): its bar
 * line, its place among that line's bars (from 0), the pass of the repeat
 * it plays in (null outside one, and in an open repeat, whose passes are
 * unknown), and the line of the replay heading it plays under, if any.
 */
export type BarSource = { line: number; bar: number; pass: number | null; replay: number | null };
/** The words a played bar sings, given where it comes from; undefined when none. */
export type Sing = (bar: PlayedBar, from: BarSource) => PlayedBar["lyrics"];

/** Nested repeats multiply; expansion stops here rather than run away. */
export const MAX_EXPANDED_BARS = 10_000;

type BarsLine = Extract<Line, { kind: "bars" }>;

/** A slot without its syllable: `%` copies a bar's notes, not its words (grammar 4.3). */
const unsungSimple = (s: SimpleSlot): SimpleSlot => {
	if (s.kind !== "chord" || !s.syllable) return s;
	const { syllable: _, ...rest } = s;
	return rest;
};
const unsung = (s: Slot): Slot =>
	s.kind === "group" ? { ...s, members: s.members.map(unsungSimple) } : unsungSimple(s);
type SectionLine = Extract<Line, { kind: "section" }>;
type Section = { heading: SectionLine | null; lines: Line[] };
/** A cell with `%` already resolved to the slots it copies. */
type Played =
	| {
			kind: "bar";
			meter: Meter | null;
			slots: Slot[];
			own: boolean;
			written: number;
			/** Its place among its line's bars, from 0. */
			bar: number;
			rehearsal?: string;
			words?: Words[];
			tacet?: true;
	  }
	| { kind: "fermata" }
	| { kind: "direction"; direction: Direction };
/**
 * Where play is: the main pass, which stops at the jump; seeking the segno
 * or the coda, playing nothing; the return after the jump; or done.
 */
type Phase = "main" | "jumped" | "seek segno" | "seek coda" | "return" | "done";
/**
 * How each mark moves play along. A mark the jump does not use is an error
 * that drops the jump, so with a jump planned every mark here applies.
 */
const NEXT: Partial<Record<Phase, Partial<Record<Direction["kind"], Phase>>>> = {
	main: { jump: "jumped" },
	"seek segno": { segno: "return" },
	"seek coda": { coda: "return" },
	return: { fine: "done", "to coda": "seek coda" },
};

/** The warning for a cell whose slots divide its beats unevenly (grammar 2.1). */
function uneven(slots: number, meter: Meter, line: number): ChartDiagnostic | null {
	const b = beatsOf(meter);
	if (b % slots === 0 || slots % b === 0) return null;
	return {
		line,
		severity: "warning",
		message: `${slots} slots divide ${b} beats unevenly`,
		token: `${slots}`,
	};
}

const PUSH_MARKS = { eighth: "<", sixteenth: "<<" } as const;
const PUSH_LENGTH = { eighth: 1 / 8, sixteenth: 1 / 16 } as const;

/** Why a push can't take its time from a slot this long; null when it can. */
function pushProblem(push: Push, before: number | null): string | null {
	if (before === null)
		return "a push takes its time from the slot before it, and nothing plays before this one; write a pickup bar";
	return PUSH_LENGTH[push] > before + 1e-9
		? `${push === "eighth" ? "an eighth" : "a sixteenth"} push is longer than the slot before it`
		: null;
}

/**
 * A bar's pushes as its slots time them: the first slot (whose push takes
 * its time from the bar before), the problems of the others, each once in
 * order, and the last slot's length; null when the bar has no slots.
 */
type Pushes = {
	first: { push?: Push } | null;
	inner: [Push, string][];
	last: number | null;
};

function pushesIn(slots: Slot[], meter: Meter): Pushes {
	const timed: { slot: SimpleSlot & { push?: Push }; length: number }[] = slotTimes(slots, meter);
	const inner = new Map<string, Push>();
	timed.forEach(({ slot }, i) => {
		const prior = timed[i - 1];
		const problem = prior && slot.push && pushProblem(slot.push, prior.length);
		if (problem && slot.push && !inner.has(problem)) inner.set(problem, slot.push);
	});
	return {
		first: timed[0]?.slot ?? null,
		inner: [...inner].map(([problem, push]) => [push, problem]),
		last: timed.at(-1)?.length ?? null,
	};
}

const normalize = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

const isWritten = (s: Section) => s.lines.some((l) => l.kind === "bars" || l.kind === "invalid");

/** Grammar §6: an empty section that matches nothing, and how to fix it. */
function unmatchedReplay(heading: SectionLine, sections: Section[]): string {
	const name = normalize(heading.name);
	const later = sections.find(
		(s) =>
			s.heading &&
			s.heading.line > heading.line &&
			normalize(s.heading.name) === name &&
			isWritten(s),
	)?.heading;
	const fix = later
		? `replays use only earlier sections (it is written at line ${later.line})`
		: "write its bars under it, or remove the heading";
	return `"${heading.name}" has no bars and no earlier section has that name; ${fix}`;
}

/** Every played bar in order, with an open repeat's pass included once. */
export function flattenBars(events: ChartEvent[]): PlayedBar[] {
	return events.flatMap((e) =>
		e.kind === "bar" ? [e.bar] : e.kind === "open" ? flattenBars(e.events) : [],
	);
}

/** Remove the last bar, looking inside a final open pass and past a final fermata. */
function removeLastBar(events: ChartEvent[]): boolean {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e?.kind === "bar") {
			events.splice(i, 1);
			return true;
		}
		if (e?.kind === "open" && removeLastBar(e.events)) return true;
	}
	return false;
}

/**
 * Turn the written chart into the bars in play order: sections and their
 * replays, repeats, directive changes, `%` and elision.
 */
/**
 * `label` names the part a projected chart is (grammar 7.4), for its
 * messages; `share` is how many parts split the expansion budget.
 */
export function expand(
	lines: Line[],
	label?: string,
	share = 1,
	/** False for one line of a part (grammar 7.6): the pedal is the part's, warned of once its lines are folded. */
	pedal = true,
	/** The words each bar sings, for the line that sings them (grammar 7.7). */
	sing?: Sing,
): {
	events: ChartEvent[];
	sections: SectionOccurrence[];
	diagnostics: ChartDiagnostic[];
} {
	const diagnostics: ChartDiagnostic[] = [];
	const maxBars = Math.max(1, Math.floor(MAX_EXPANDED_BARS / share));
	// Repeats of bodies that play no bars (fermatas only) are bounded too.
	const maxWork = maxBars * 10;
	// The return after a jump plays sections again: it reports only what the first pass did not.
	const reported = new Set<string>();
	let again = false;
	const error = (line: number, message: string, token: string) => {
		const key = `${line}\u0000${message}`;
		if (again && reported.has(key)) return;
		reported.add(key);
		diagnostics.push({ line, severity: "error", message, token });
	};

	const sections: Section[] = [{ heading: null, lines: [] }];
	for (const l of lines) {
		if (l.kind === "section") sections.push({ heading: l, lines: [] });
		else if (l.kind !== "title") sections.at(-1)?.lines.push(l);
	}

	// % copies the bar written before it, one-bar meter included, so a section plays the same wherever it is replayed.
	const resolved = new Map<BarsLine, Played[]>();
	let previous: { meter: Meter | null; slots: Slot[]; tacet?: true } | null = null;
	const tacetBefore = (line: number, what: string) =>
		error(line, `${label ?? "this part"} was tacet in the bar before; ${what}`, what.slice(0, 1));
	let written = 0;
	/** A rehearsal mark waiting for the bar after it (grammar 2.5). */
	const pending: { mark: { label: string; line: number } | null } = { mark: null };
	/** The bar as written, with the mark before it and its own words. */
	const marked = (bar: Extract<Played, { kind: "bar" }>, words: Words[] | undefined): Played => {
		const out: Extract<Played, { kind: "bar" }> = { ...bar };
		if (pending.mark) out.rehearsal = pending.mark.label;
		if (words) out.words = words;
		pending.mark = null;
		return out;
	};
	type WrittenCell = BarsLine["cells"][number];
	const markBar = (c: Extract<WrittenCell, { kind: "rehearsal" }>, line: number): null => {
		if (pending.mark) error(line, "two rehearsal marks on one bar", `@${c.label}`);
		pending.mark = { label: c.label, line };
		return null;
	};
	const simile = (c: Extract<WrittenCell, { kind: "simile" }>, line: number): Played => {
		if (!previous) error(line, "% has no bar before it to repeat", "%");
		else if (previous.tacet) tacetBefore(line, "% has nothing to copy");
		const meter = previous?.meter ?? null;
		const slots: Slot[] = previous?.slots.map(unsung) ?? [{ kind: "hold" }];
		return marked({ kind: "bar", meter, slots, own: false, written: ++written, bar: 0 }, c.words);
	};
	/** A bar that opens with `/` holds what was sounding before it. */
	const checkHold = (c: Extract<WrittenCell, { kind: "slots" }>, line: number) => {
		const first = c.slots[0];
		const head = first?.kind === "group" ? first.members[0] : first;
		if (head?.kind !== "hold") return;
		if (!previous) error(line, "/ has nothing before it to hold", "/");
		else if (previous.tacet) tacetBefore(line, "/ has nothing to hold");
	};
	const ownBar = (c: Extract<WrittenCell, { kind: "slots" }>, line: number): Played => {
		checkHold(c, line);
		previous = { meter: c.meter, slots: c.slots, ...(c.tacet && { tacet: c.tacet }) };
		const bar = {
			kind: "bar",
			meter: c.meter,
			slots: c.slots,
			own: true,
			written: ++written,
			bar: 0,
			...(c.tacet && { tacet: c.tacet }),
		} as const;
		return marked(bar, c.words);
	};
	const resolveCell = (c: WrittenCell, line: number): Played | null => {
		if (c.kind === "fermata") return { kind: "fermata" };
		if (c.kind === "direction") return c;
		if (c.kind === "rehearsal") return markBar(c, line);
		return c.kind === "simile" ? simile(c, line) : ownBar(c, line);
	};
	for (const l of sections.flatMap((s) => s.lines)) {
		if (l.kind === "invalid") written += l.written;
		if (l.kind !== "bars") continue;
		let bar = 0;
		resolved.set(
			l,
			l.cells
				.map((c) => resolveCell(c, l.line))
				.filter((p): p is Played => p !== null)
				.map((p) => (p.kind === "bar" ? { ...p, bar: bar++ } : p)),
		);
	}
	const unused = pending.mark;
	if (unused)
		error(unused.line, "a rehearsal mark marks the bar after it; none follows", `@${unused.label}`);

	// Pair |: and :| within each section, with any endings.
	const itemsOf = new Map(sections.map((s) => [s, pairRepeats(s.lines, error)]));
	const plan: JumpPlan | null = planJump(lines, error);

	const start = (): {
		key: Key | null;
		time: Meter;
		tempo: number | null;
		change: PlayedBar["tempoChange"];
		feel: Feel;
		swingPercent: number | undefined;
	} => ({
		key: null,
		time: { n: 4, d: 4 },
		tempo: null,
		change: null,
		feel: "straight",
		swingPercent: undefined,
	});
	const state = start();
	const warned = new Set<number>();
	const warn = (line: number, message: string, token: string) => {
		if (warned.has(line)) return;
		warned.add(line);
		diagnostics.push({ line, severity: "warning", message, token });
	};
	/** A rit. or accel. runs from the next bar to the next `tempo:`; `a tempo` ends it. */
	const changeTempo = (c: TempoChange, line: number) => {
		if (c.kind === "a tempo") {
			if (!state.change) warn(line, "a tempo, but no rit. or accel. is in force", "a tempo");
			state.change = null;
			return;
		}
		const from = state.tempo;
		const wrongWay =
			c.kind === "rit" ? (to: number, f: number) => to >= f : (to: number, f: number) => to <= f;
		if (c.to !== null && from !== null && wrongWay(c.to, from))
			warn(
				line,
				`${c.kind}. to ${c.to} is not ${c.kind === "rit" ? "slower" : "faster"} than ${from}`,
				`${c.kind}. to ${c.to}`,
			);
		state.change = { kind: c.kind, from, to: c.to };
	};
	const apply = (set: Directives, line: number) => {
		if (set.key) state.key = set.key;
		if (set.time) state.time = set.time;
		if (set.tempo) {
			state.tempo = set.tempo;
			state.change = null;
		}
		if (set.tempoChange) changeTempo(set.tempoChange, line);
		if (set.feel) {
			state.feel = set.feel;
			state.swingPercent = set.swingPercent;
		}
	};
	let count = 0;
	let work = 0;
	let capped = false;
	let openDepth = 0;
	const nestedOpen = new Set<number>();
	const checked = new Set<Played>();
	const stop = (line: number) => {
		capped = true;
		error(line, `expansion stopped at ${maxBars} bars`, "x");
	};
	let sectionName: string | null = null;
	/** The pass of the repeat being played, and the replay heading being played, for the words (grammar 7.7). */
	const where: Pick<BarSource, "pass" | "replay"> = { pass: null, replay: null };
	let phase: Phase = "main";
	const stopped = () => capped || phase === "jumped" || phase === "done";
	const jumped = () => phase === "jumped";
	const seeking = () => phase === "seek segno" || phase === "seek coda";
	/** The jump is taken once; after it, `To Coda` and `Fine` take effect. */
	const direct = (d: Direction) => {
		if (plan) phase = NEXT[phase]?.[d.kind] ?? phase;
	};

	/** A written bar's slot count, checked the first time it plays. */
	const checkSlots = (p: Extract<Played, { kind: "bar" }>, meter: Meter, line: number) => {
		if (!p.own || checked.has(p)) return;
		checked.add(p);
		const warning = uneven(p.slots.length, meter, line);
		if (warning) diagnostics.push(warning);
	};
	/** A bar as played now; in a one-bar meter it also carries the `time:` in force (grammar 2.4). */
	const barOf = (p: Extract<Played, { kind: "bar" }>, line: number): PlayedBar => {
		const meter = p.meter ?? state.time;
		checkSlots(p, meter, line);
		const { key, tempo, change: tempoChange, feel, swingPercent } = state;
		return {
			index: 0,
			written: p.written,
			line,
			section: sectionName,
			meter,
			...(p.meter && { time: state.time }),
			key,
			tempo,
			tempoChange,
			feel,
			...(swingPercent === undefined ? {} : { swingPercent }),
			slots: p.slots,
			...(p.rehearsal === undefined ? {} : { rehearsal: p.rehearsal }),
			...(p.words === undefined ? {} : { words: p.words }),
			...(p.tacet && { tacet: p.tacet }),
		};
	};
	/** The bar with the words it sings here, if any (grammar 7.7). */
	const sung = (bar: PlayedBar, p: Extract<Played, { kind: "bar" }>, line: number): PlayedBar => {
		const lyrics = sing?.(bar, { line, bar: p.bar, ...where });
		return lyrics ? { ...bar, lyrics } : bar;
	};
	/** How long the slot played just before is, in whole notes; null after a fermata or at the start. */
	const before: { length: number | null } = { length: null };
	const pushReported = new Set<string>();
	const report = (line: number, problem: string | null | undefined, push: Push | undefined) => {
		const key = `${line}\u0000${problem}`;
		if (!problem || pushReported.has(key)) return;
		pushReported.add(key);
		error(line, problem, PUSH_MARKS[push ?? "eighth"]);
	};
	const pushesOf = perWritten(pushesIn);
	/** Each push takes its time from the slot played just before it (grammar 2.8). */
	const checkPushes = (bar: PlayedBar) => {
		const { first, inner, last } = pushesOf(bar.slots, bar.meter);
		if (first?.push) report(bar.line, pushProblem(first.push, before.length), first.push);
		for (const [push, problem] of inner) report(bar.line, problem, push);
		if (last !== null) before.length = last;
	};
	const emit = (p: Played, line: number, out: ChartEvent[]) => {
		if (stopped()) return;
		if (p.kind === "direction") return direct(p.direction);
		if (seeking()) return;
		if (++work > maxWork) return stop(line);
		if (p.kind === "fermata") {
			before.length = null;
			return void out.push({ kind: "fermata", line });
		}
		if (count >= maxBars) return stop(line);
		count++;
		const bar = barOf(p, line);
		checkPushes(bar);
		out.push({ kind: "bar", bar: sung(bar, p, line) });
	};
	/** Play `body` `repeat` times into `out`; an open repeat plays one pass inside an open event. */
	const times = (
		repeat: Repeat,
		line: number,
		out: ChartEvent[],
		body: (into: ChartEvent[]) => void,
	) => {
		if (repeat === "open") {
			if (openDepth > 0) {
				if (!nestedOpen.has(line))
					error(line, "an open repeat inside another open repeat", "x ...");
				nestedOpen.add(line);
				body(out);
				return;
			}
			const inner: ChartEvent[] = [];
			openDepth++;
			body(inner);
			openDepth--;
			out.push({ kind: "open", line, events: inner });
			return;
		}
		// After the jump every repeat plays once.
		passes(phase === "main" ? (repeat ?? 1) : 1, repeat !== null, line, () => body(out));
	};
	/** Play `n` passes; a repeat's are numbered for the words (grammar 7.7), a plain line's are not. */
	const passes = (n: number, counted: boolean, line: number, play: () => void) => {
		const outer = where.pass;
		for (let i = 0; i < n && !stopped(); i++) {
			if (++work > maxWork) return stop(line);
			if (counted) where.pass = i + 1;
			play();
		}
		where.pass = outer;
	};

	const playLine = ({ line: l, repeat }: Entry, out: ChartEvent[]) => {
		if (stopped()) return;
		if (l.kind === "directive") apply(l.set, l.line);
		if (l.kind !== "bars") return;
		times(repeat, l.line, out, (into) => {
			for (const c of resolved.get(l) ?? []) emit(c, l.line, into);
		});
	};
	const playItems = (items: Item[], out: ChartEvent[]) => {
		for (const it of items) {
			if (it.kind === "line") playLine(it, out);
			else if (it.endings.length) playEndings(it, out);
			else
				times(it.repeat, it.line, out, (into) => {
					for (const e of it.entries) playLine(e, into);
				});
		}
	};
	/** Each pass plays the body, then its ending; after the jump, only the last pass. */
	const playEndings = (it: Extract<Item, { kind: "bracket" }>, out: ChartEvent[]) => {
		const highest = typeof it.repeat === "number" ? it.repeat : 1;
		const first = phase === "main" ? 1 : highest;
		const outer = where.pass;
		for (let pass = first; pass <= highest && !stopped(); pass++) {
			if (++work > maxWork) return stop(it.line);
			// The return after a jump is no new pass: it plays pass 1's words (grammar 7.7).
			where.pass = phase === "main" ? pass : 1;
			for (const e of it.entries) playLine(e, out);
			const ending = it.endings.find((x) => x.passes.includes(pass));
			if (ending) playLine(ending.entry, out);
		}
		where.pass = outer;
	};

	const events: ChartEvent[] = [];
	const occurrences: [Omit<SectionOccurrence, "form">, ChartEvent[]][] = [];
	const definitions = new Map<string, Section>();
	/** Headings already played, so a written section played again by the jump is a replay. */
	const heard = new Set<number>();
	const playSections = () => {
		for (const s of sections) {
			if (stopped()) return;
			playSection(s);
		}
	};
	type Heading = { replayOf: number | null; elided: boolean };
	/** A written section's bars into `out`. */
	const playWritten = (s: Section, h: SectionLine, out: ChartEvent[]): Heading => {
		definitions.set(normalize(h.name), s);
		if (h.elided) error(h.line, "-> is only for a replay; leave the bar out instead", "->");
		times(h.repeat, h.line, out, (into) => playItems(itemsOf.get(s) ?? [], into));
		return { replayOf: null, elided: false };
	};
	/** Whether `out` ends with the last bar written in `s` (grammar 6: what `->` cuts). */
	const reachesEnd = (s: Section, out: ChartEvent[]) => {
		const bars = s.lines.flatMap((l) => (l.kind === "bars" ? (resolved.get(l) ?? []) : []));
		const last = bars.findLast((p) => p.kind === "bar");
		return last?.kind === "bar" && flattenBars(out).at(-1)?.written === last.written;
	};
	/** A replay's bars into `out`, then its own lines; null when it replays nothing. */
	const playReplay = (s: Section, h: SectionLine, out: ChartEvent[]): Heading | null => {
		// A nameless heading is already an error; it has nothing to replay.
		if (!h.name) return null;
		const source = definitions.get(normalize(h.name));
		if (!source?.heading) {
			error(h.line, unmatchedReplay(h, sections), h.name);
			return null;
		}
		where.replay = h.line;
		times(h.repeat, h.line, out, (into) => playItems(itemsOf.get(source) ?? [], into));
		where.replay = null;
		// It cuts the last bar as written; play stopped before it (a Fine, a To Coda) never reaches it.
		const elided = h.elided && reachesEnd(source, out) && removeLastBar(out);
		// A replay heading stands for its bars: its own lines (directives) come after them.
		playItems(itemsOf.get(s) ?? [], out);
		return { replayOf: source.heading.line, elided };
	};
	/** A section occurrence; one the jump plays again is a replay of itself. */
	const record = (h: SectionLine, out: ChartEvent[], replayOf: number | null, elided: boolean) => {
		// Sections the return passes over while seeking play nothing and are not occurrences.
		if (phase !== "main" && phase !== "jumped" && !out.length) return;
		const of = replayOf ?? (heard.has(h.line) ? h.line : null);
		heard.add(h.line);
		occurrences.push([
			{ name: h.name, line: h.line, replayOf: of, firstBar: null, lastBar: null, elided },
			out,
		]);
	};
	const playSection = (s: Section) => {
		const h = s.heading;
		sectionName = h?.name ?? null;
		if (!h) return playItems(itemsOf.get(s) ?? [], events);
		const out: ChartEvent[] = [];
		const played = isWritten(s) ? playWritten(s, h, out) : playReplay(s, h, out);
		if (!played) return;
		events.push(...out);
		record(h, out, played.replayOf, played.elided);
	};
	playSections();
	if (jumped() && plan) {
		// The return reads the chart again from the top, so the directives in force are the written ones.
		Object.assign(state, start());
		again = true;
		phase = plan.to === "start" ? "return" : "seek segno";
		playSections();
	}

	flattenBars(events).forEach((b, i) => {
		b.index = i + 1;
	});
	const forms = new Map<number, number>();
	const sectionsOut = occurrences.map(([occ, out]): SectionOccurrence => {
		const bars = flattenBars(out);
		const written = occ.replayOf ?? occ.line;
		if (!forms.has(written)) forms.set(written, forms.size);
		return {
			...occ,
			firstBar: bars[0]?.index ?? null,
			lastBar: bars.at(-1)?.index ?? null,
			form: forms.get(written) ?? 0,
		};
	});
	if (pedal) diagnostics.push(...pedalWarnings(flattenBars(events)));
	return { events, sections: sectionsOut, diagnostics };
}
