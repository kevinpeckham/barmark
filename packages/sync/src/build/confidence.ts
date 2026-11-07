import { type ChartParse, type PlayedBar, printSlot } from "barmark";
import type { Input } from "./input.js";
import type { SymbolRun } from "./runs.js";
import type { ConfidenceRecord } from "./types.js";

/**
 * How well the runs back one slot: the time covered by runs of its symbol,
 * each weighted by its confidence (1 where not given), over the slot's time.
 * That is agreement times the duration-weighted mean confidence. `from` is
 * the first run that may still reach the slot.
 */
function slotConfidence(runs: SymbolRun[], from: number, symbol: string, a: number, b: number) {
	let weighted = 0;
	for (let j = from; j < runs.length; j++) {
		const r = runs[j] as SymbolRun;
		if (r.start >= b) break;
		if (r.symbol === symbol)
			weighted += (Math.min(r.end, b) - Math.max(r.start, a)) * (r.confidence ?? 1);
	}
	return Math.min(1, Math.max(0, weighted / (b - a)));
}

/** One played bar's slot confidences; `held` carries the symbol a hold takes across bars. */
function barSlots(
	bar: PlayedBar,
	span: { start: number; end: number },
	runs: SymbolRun[],
	cursor: { from: number; held: string },
): number[] {
	const n = bar.slots.length;
	const len = span.end - span.start;
	return bar.slots.map((slot, j) => {
		if (slot.kind !== "hold") cursor.held = printSlot(slot);
		const a = span.start + (j / n) * len;
		const b = span.start + ((j + 1) / n) * len;
		while (cursor.from < runs.length && (runs[cursor.from] as SymbolRun).end <= a) cursor.from++;
		return cursor.held === "?" ? 0 : slotConfidence(runs, cursor.from, cursor.held, a, b);
	});
}

/**
 * The experimental confidence record for a printed chart (spec 5): per slot,
 * agreement times detector confidence, computed on the printed chart's
 * played bars, which match `input.bars` one to one. One sweep over the runs.
 */
export function confidenceOf(parse: ChartParse, input: Input): ConfidenceRecord {
	const cursor = { from: 0, held: "?" };
	const bars: ConfidenceRecord["bars"] = [];
	for (const [i, bar] of parse.bars.entries()) {
		const span = input.bars[i];
		if (!span) break;
		const slots = barSlots(bar, span, input.runs, cursor);
		const mean = slots.reduce((sum, c) => sum + c, 0) / slots.length;
		bars.push({ bar: bar.index, confidence: Math.min(1, mean), slots });
	}
	const record: ConfidenceRecord = { format: "barmark-confidence", version: 1, bars };
	const { key, meter, tempo, sections } = input.confidence;
	if (key !== undefined) record.key = key;
	if (meter !== undefined) record.meter = meter;
	if (tempo !== undefined) record.tempo = tempo;
	if (sections.size > 0)
		record.sections = [...sections]
			.sort(([a], [b]) => a - b)
			.map(([b, confidence]) => ({ bar: b + 1, confidence }));
	return record;
}
