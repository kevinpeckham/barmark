/**
 * A bar crowded with syllables, notes or words, inside repeats played many
 * times, exports in time linear in what it writes: a chart from a shared
 * link reaches this code, and a few kilobytes of it once took minutes.
 */
import { expect, test } from "bun:test";
import { exportMusicXml } from "../src/index.js";

// The ratio is of best-of-three timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 60_000;

const many = (n: number, slot: string) => Array.from({ length: n }, () => slot).join(" ");

/** The finding's shape: one bar of `n` syllables in a lyric row, played eight times through nested repeats. */
const lyricRow = (n: number) => `## A x4\n|: C :| x2\nlyrics: | ${many(n, "la")} |\n`;

/** A voice singing `n` notes in one bar, each with a syllable and words, played eight times. */
const melody = (n: number) =>
	`part: Vo = Voice, instrument: voice\n## A x4\nVo |: ${many(n, '"w" {C4}:la')} :| x2\n`;

/** A bare line of one chord held `n` times, words on each, over a line of `n` notes, played eight times. */
const bare = (n: number) =>
	[
		"part: Gtr = Electric Guitar 1",
		"## A x4",
		`Gtr     |: C ${many(n - 1, '"w" /')} :| x2`,
		`Gtr.Mel |: ${many(n, "{C4}")} :| x2`,
		"",
	].join("\n");

/** One bar line played `n` times under a lyric row: its passes share the one measure. */
const passes = (n: number) => `| C |\nlyrics: | la |\n| D | x${n}\n`;

/** The best of three exports of `text`, after one to warm up. */
function timed(text: string): number {
	let ms = Number.POSITIVE_INFINITY;
	for (let run = 0; run < 4; run++) {
		const start = performance.now();
		const r = exportMusicXml(text);
		if (run > 0) ms = Math.min(ms, performance.now() - start);
		if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
	}
	return ms;
}

for (const [name, chart] of [
	["a lyric row's syllables", lyricRow],
	["a melody's syllables and words", melody],
	["a bare line's words over a named line's notes", bare],
] as const)
	test(
		`${name}: eight times as many in a bar export in linear time`,
		() => {
			const small = timed(chart(500));
			const large = timed(chart(4000));
			// Eight times as many, at most sixteen times as long (quadratic would be sixty-four).
			expect(large / small).toBeLessThan(16);
		},
		TIMEOUT,
	);

test(
	"a bar line played eight times as often exports in linear time",
	() => {
		const small = timed(passes(1250));
		const large = timed(passes(9999));
		// Eight times the passes, at most ten times as long: copying each pass's list took fifteen.
		expect(large / small).toBeLessThan(10);
	},
	TIMEOUT,
);
