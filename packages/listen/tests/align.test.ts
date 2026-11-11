/**
 * `alignChart` and its timing map (design §6.3): the app's
 * `alignedTimingMap.test.ts`, ported; a synthetic song rendered from its
 * own chart aligned whole; a wrong chart and a silent recording refused
 * with the alignment beside the reasons; and every bad input a named
 * refusal, never a throw.
 */
import { describe, expect, test } from "bun:test";
import { chartHash, checkTimingMap } from "@barmark/sync";
import { parseChart } from "barmark";
import { type AlignedChart, alignChart } from "../src/align/align.js";
import { chartPadBars } from "../src/align/bars.js";
import { renderWhole } from "../src/align/render.js";
import { alignedTimingMap } from "../src/align/timing.js";
import { type Features, recordingFeatures } from "../src/features/index.js";
import { featuresOf } from "./helpers/features.js";
import { seeded } from "./helpers/seeded.js";

const RATE = 22050;
const PROGRESSION = ["D", "A", "Bm", "G", "Em", "F#m", "C", "E7", "Dsus4", "Am", "Bb", "F"];
/** Each chord of PROGRESSION a tritone up. */
const TRITONE = ["G#", "D#", "Fm", "C#", "A#m", "Cm", "F#", "Bb7", "G#sus4", "D#m", "E", "B"];

/** A chart of `chords`, four bars a line, in `meter` at `tempo`. */
function chartOf(chords: string[], tempo = 120, meter = "4/4"): string {
	const lines = [`time: ${meter}, tempo: ${tempo}`];
	for (let b = 0; b < chords.length; b += 4)
		lines.push(`| ${chords.slice(b, b + 4).join(" | ")} |`);
	return `${lines.join("\n")}\n`;
}

/** The recording of `chart`: its own pads rendered, with seeded noise, as features. */
function recordingOf(chart: string, seed = 1): Features {
	const bars = chartPadBars(parseChart(chart), undefined);
	if (!bars.ok) throw new Error(`refused: ${bars.reason}`);
	const { samples } = renderWhole(bars.bars, RATE);
	const rand = seeded(seed);
	const noisy = samples.map((v) => v + 0.02 * (rand() * 2 - 1));
	const r = recordingFeatures(noisy, RATE);
	if (!r.ok) throw new Error(`refused: ${r.refusals[0]?.reason}`);
	return r.value;
}

const CHART = chartOf([...PROGRESSION, ...PROGRESSION]);
const features = recordingOf(CHART);
const reasons = (r: { ok: boolean; refusals?: { reason: string }[] }) =>
	r.ok ? [] : (r.refusals ?? []).map((x) => x.reason);

describe("alignedTimingMap: the app's alignedTimingMap", () => {
	const TEXT = "## Verse\n| C | G | Am |\n";
	const parse = parseChart(TEXT);

	test("a start per played bar and the end, hashed to the chart, source aligned", () => {
		expect(alignedTimingMap(TEXT, parse, [0.4, 2.4, 4.5, 6.5], 60, undefined)).toEqual({
			format: "barmark-timing",
			version: 1,
			chart: { bars: 3, hash: chartHash(TEXT) },
			recording: { duration: 60 },
			source: "aligned",
			bars: [
				{ bar: 1, start: 0.4 },
				{ bar: 2, start: 2.4 },
				{ bar: 3, start: 4.5 },
			],
			end: 6.5,
		});
	});

	test("null when the starts do not check against the chart or run short", () => {
		expect(alignedTimingMap(TEXT, parse, [0.4, 0.2, 4.5, 6.5], 60, undefined)).toBeNull();
		expect(alignedTimingMap(TEXT, parse, [0, 2, 4], 60, undefined)).toBeNull();
		expect(alignedTimingMap("", parseChart(""), [0], 60, undefined)).toBeNull();
		expect(alignedTimingMap(TEXT, parse, [0, 2, Number.NaN, 6], 60, undefined)).toBeNull();
	});

	test("a pickup chart's map starts at its pickup, bar 1 by index; recording.id is copied", () => {
		const text = "time: 4/4, tempo: 120\n| [2/4] G | C | G |\n";
		const p = parseChart(text);
		expect(p.pickup).toBe(true);
		const map = alignedTimingMap(text, p, [0.5, 1.5, 3.5, 5.5], 30, "take-2");
		expect(map?.bars.map((b) => b.bar)).toEqual([1, 2, 3]);
		expect(map?.recording).toEqual({ duration: 30, id: "take-2" });
		expect(checkTimingMap(map, { text }).diagnostics).toEqual([]);
	});
});

describe("alignChart on a song rendered from its own chart", () => {
	const r = alignChart({ chart: CHART, features, recording: { id: "mix" } });

	test("ok: the map checks clean, a bar per played bar, the recording's own duration", () => {
		expect(reasons(r)).toEqual([]);
		if (!r.ok) return;
		const { timing, alignment, fit, placements }: AlignedChart = r.value;
		expect(checkTimingMap(timing, { text: CHART }).diagnostics).toEqual([]);
		expect(timing.chart.bars).toBe(parseChart(CHART).bars.length);
		expect(timing.recording).toEqual({ duration: features.duration, id: "mix" });
		expect(timing.source).toBe("aligned");
		expect(timing.bars.map((b) => b.start)).toEqual(alignment.barStarts.slice(0, -1));
		expect(timing.end).toBe(alignment.barStarts.at(-1) as number);
		expect(alignment.samePiece).toBe(true);
		expect(alignment.repair).not.toBeNull();
		expect(fit.declaredBar).toBe(alignment.chartBar);
		expect(placements).toEqual({ sections: [], keyChanges: [], tempoChanges: [] });
		expect(r.warnings).toEqual([]);
	});

	test("declared sets the fit's declared bar; the comb still centres on the chart's", () => {
		// 3/4 at 90 counts its beats: 3 × 60 / 90 = 2 s, the chart's own bar, and fits.
		const same = alignChart({ chart: CHART, features, declared: { meter: "3/4", tempo: 90 } });
		if (!same.ok) throw new Error(reasons(same).join(", "));
		expect(same.value.fit.declaredBar).toBe(2);
		// 4/4 at 60: a 4 s declared bar, which the 2 s aligned bars are far off.
		const slow = alignChart({ chart: CHART, features, declared: { meter: "4/4", tempo: 60 } });
		expect(reasons(slow)).toContain("bar-length-off");
		const declared = alignChart({ chart: CHART, features, declared: { meter: "4/4", tempo: 110 } });
		if (!declared.ok) throw new Error(reasons(declared).join(", "));
		expect(declared.value.fit.declaredBar).toBe((4 * 60) / 110);
		expect(declared.value.alignment.chartBar).toBe(2);
	});

	test("a wrong chart, every chord a tritone up, is refused not-same-piece, with the alignment and placements", () => {
		const wrong = alignChart({ chart: chartOf([...TRITONE, ...TRITONE]), features });
		expect(wrong.ok).toBe(false);
		if (wrong.ok) return;
		expect(wrong.refusals.map((x) => x.reason)).toContain("not-same-piece");
		expect(wrong.alignment).not.toBeNull();
		expect(wrong.placements).not.toBeNull();
	});

	test("a silent recording lists no-period, with the alignment", () => {
		const silent = featuresOf({ duration: features.duration });
		const r2 = alignChart({ chart: CHART, features: silent });
		expect(r2.ok).toBe(false);
		if (r2.ok) return;
		expect(r2.refusals.map((x) => x.reason)).toContain("no-period");
		expect(r2.refusals.map((x) => x.reason)).not.toContain("bars-off-middle");
		expect(r2.alignment?.repair).toBeNull();
		expect(r2.placements).not.toBeNull();
	});

	test("a chart with diagnostics aligns, warned chart-diagnostics with the count", () => {
		const chords = [...PROGRESSION, ...PROGRESSION];
		chords[5] = "CM7"; // unreadable: a ? that holds the bar before's chord
		const r2 = alignChart({ chart: chartOf(chords), features });
		expect(reasons(r2)).toEqual([]);
		expect(r2.ok).toBe(true);
		const warning = r2.warnings.find((w) => w.code === "chart-diagnostics");
		expect(warning?.detail).toEqual({ count: 1 });
	});

	// Each song is rendered and its features read: about 0.4 s a chart.
	test("map-invalid is unreachable: 30 seeded charts that align all give a map", () => {
		const rand = seeded(13);
		let aligned = 0;
		for (let k = 0; k < 30; k++) {
			const count = 6 + Math.floor(rand() * 11);
			const chords = Array.from(
				{ length: count },
				() => PROGRESSION[Math.floor(rand() * PROGRESSION.length)] as string,
			);
			const meter = rand() < 0.5 ? "4/4" : "3/4";
			const chart = chartOf(chords, 90 + Math.floor(rand() * 70), meter);
			const out = alignChart({ chart, features: recordingOf(chart, k + 2) });
			expect(reasons(out)).not.toContain("map-invalid");
			if (!out.ok) continue;
			aligned++;
			expect(checkTimingMap(out.value.timing, { text: chart }).diagnostics).toEqual([]);
		}
		expect(aligned).toBeGreaterThanOrEqual(20);
	}, 60_000);

	test("the alignment it returns is its own: aligning again gives the same numbers", () => {
		const again = alignChart({ chart: CHART, features, recording: { id: "mix" } });
		expect(again).toEqual(r);
	});
});

describe("alignChart never throws: each bad input is its named refusal", () => {
	const good = { chart: CHART, features };
	const refusalOf = (input: unknown, options?: unknown) => {
		// biome-ignore lint/suspicious/noExplicitAny: feeding junk on purpose.
		const out = alignChart(input as any, options as any);
		if (out.ok) throw new Error("aligned");
		expect(out.alignment).toBeNull();
		expect(out.placements).toBeNull();
		return out.refusals[0];
	};

	test("chart: 5, junk features, an option of another scope, junk input", () => {
		expect(refusalOf({ ...good, chart: 5 })).toMatchObject({
			reason: "invalid-input",
			detail: { field: "chart" },
		});
		expect(refusalOf({ ...good, features: { junk: true } })?.reason).toBe("features-invalid");
		expect(refusalOf(good, { ALIGNMENT_SOUND_FLOOR: 0.1 })).toMatchObject({
			reason: "invalid-option",
			detail: { option: "ALIGNMENT_SOUND_FLOOR" },
		});
		for (const input of [null, 5, "chart"])
			expect(refusalOf(input)).toMatchObject({
				reason: "invalid-input",
				detail: { field: "input" },
			});
	});

	test("tempo, the fallback, is checked before the bars: 0, negative, NaN, ±∞ and 1,000 are invalid-input", () => {
		const untimed = "| C | G |\n";
		for (const tempo of [0, -120, Number.NaN, Number.POSITIVE_INFINITY, -Infinity, 1000, "120"])
			expect(refusalOf({ chart: untimed, features, tempo })).toMatchObject({
				reason: "invalid-input",
				detail: { field: "tempo" },
			});
		// The positive case: a fallback of 120 is read, so neither the tempo nor the bars refuse.
		const read = reasons(alignChart({ chart: untimed, features, tempo: 120 }));
		expect(read).not.toContain("invalid-input");
		expect(read).not.toContain("no-tempo");
		// Two bars against 48 s: the fit refuses it, past the input and the bars.
		expect(read).toContain("bar-length-off");
	});

	test("declared, startAt and recording are checked", () => {
		expect(refusalOf({ ...good, declared: { meter: "x", tempo: 90 } })).toMatchObject({
			reason: "invalid-input",
			detail: { field: "declared.meter" },
		});
		expect(refusalOf({ ...good, declared: { meter: "4/4", tempo: 0 } })).toMatchObject({
			detail: { field: "declared.tempo" },
		});
		for (const startAt of [Number.NaN, -1, Number.POSITIVE_INFINITY, "0"])
			expect(refusalOf({ ...good, startAt })).toMatchObject({
				reason: "invalid-input",
				detail: { field: "startAt" },
			});
		expect(refusalOf({ ...good, recording: { id: 5 } })).toMatchObject({
			detail: { field: "recording.id" },
		});
		expect(refusalOf({ ...good, recording: "mix" })).toMatchObject({
			detail: { field: "recording" },
		});
	});

	test("no-bars and no-tempo, with the bar", () => {
		expect(refusalOf({ ...good, chart: "## Intro\n" })?.reason).toBe("no-bars");
		expect(refusalOf({ ...good, chart: "| C | G |\ntempo: 100\n| C |" })).toMatchObject({
			reason: "no-tempo",
			detail: { bar: 1 },
		});
	});

	test("features that throw after they are read refuse, never throw", () => {
		// A getter that counts its reads: the check reads `chroma` some number of
		// times, and the alignment reads it again, where this one throws.
		const counting = (limit: number) => {
			let reads = 0;
			const f = { ...features };
			Object.defineProperty(f, "chroma", {
				enumerable: true,
				get() {
					reads += 1;
					if (reads > limit) throw new Error("boom");
					return features.chroma;
				},
			});
			return { f, reads: () => reads };
		};
		const checked = counting(Number.POSITIVE_INFINITY);
		alignChart({ ...good, features: checked.f, declared: { meter: "x", tempo: 90 } });
		const limit = checked.reads();
		expect(limit).toBeGreaterThan(0);
		let out: ReturnType<typeof alignChart> | undefined;
		expect(() => {
			out = alignChart({ ...good, features: counting(limit).f });
		}).not.toThrow();
		if (!out || out.ok) throw new Error("aligned");
		expect(out.refusals[0]).toMatchObject({
			reason: "invalid-input",
			detail: { field: "input" },
		});
		expect(out.alignment).toBeNull();
		expect(out.placements).toBeNull();
	});

	test("the path's own refusals pass through: chart-too-long", () => {
		expect(
			refusalOf({ ...good, chart: chartOf([...PROGRESSION, ...PROGRESSION], 40) })?.reason,
		).toBe("chart-too-long");
	});
});
