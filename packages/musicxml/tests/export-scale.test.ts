/**
 * A bar crowded with syllables, notes or words, inside repeats played many
 * times, exports in time linear in what it writes: a chart from a shared
 * link reaches this code, and a few kilobytes of it once took minutes.
 */
import { expect, test } from "bun:test";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { exportMusicXml } from "../src/index.js";

const many = (n: number, slot: string) => Array.from({ length: n }, () => slot).join(" ");

// One crowded bar, repeated: the finding's chart played such a bar a thousand times, and each
// play costs the same, so one repeat measures the cost per bar with the least linear work around it.

/** The finding's shape: one bar of `n` syllables in a lyric row, in a repeat. */
const lyricRow = (n: number) => `|: C :|\nlyrics: | ${many(n, "la")} |\n`;

/** A voice singing `n` notes in one bar, each with a syllable and words, in a repeat. */
const melody = (n: number) =>
	`part: Vo = Voice, instrument: voice\nVo |: ${many(n, '"w" {C4}:la')} :|\n`;

/** A bare line of one chord held `n` times, words on each, over a line of `n` notes, in a repeat. */
const bare = (n: number) =>
	[
		"part: Gtr = Electric Guitar 1",
		`Gtr     |: C ${many(n - 1, '"w" /')} :|`,
		`Gtr.Mel |: ${many(n, "{C4}")} :|`,
		"",
	].join("\n");

/** One bar line played `n` times under a lyric row: its passes share the one measure. */
const passes = (n: number) => `| C |\nlyrics: | la |\n| D | x${n}\n`;

/** Exports `text`, failing the test if the export does. */
const exported = (text: string) => () => {
	const r = exportMusicXml(text);
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
};

for (const [name, chart] of [
	["a lyric row's syllables", lyricRow],
	["a melody's syllables and words", melody],
	["a bare line's words over a named line's notes", bare],
] as const)
	test(
		`${name}: eight times as many in a bar export in linear time`,
		() => {
			// Eight times as many, at most sixteen times as long: about seven now, 25 to 46 before.
			expect(growth(exported(chart(2000)), exported(chart(16000)), { balance: 8 })).toBeLessThan(
				16,
			);
		},
		TIMING_TIMEOUT,
	);

test(
	"a bar line played eight times as often exports in linear time",
	() => {
		// Eight times the passes, at most ten times as long: about four now, fifteen before.
		// Best of five: the small export takes milliseconds.
		expect(
			growth(exported(passes(1250)), exported(passes(9999)), { runs: 5, balance: 8 }),
		).toBeLessThan(10);
	},
	TIMING_TIMEOUT,
);
