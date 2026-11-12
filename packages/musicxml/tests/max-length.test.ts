/**
 * `maxLength`: the export stops writing once its MusicXML passes the limit,
 * so a short chart whose repeats would write gigabytes costs no more than
 * the limit. Unset, nothing changes.
 */
import { describe, expect, test } from "bun:test";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { exportMusicXml } from "../src/index.js";

const parts = (n: number) => Array.from({ length: n }, (_, i) => `part: P${i} = Piano`).join("\n");

/** Shapes a size estimate missed, each a few kilobytes that write megabytes. */
const SHAPES: [string, string][] = [
	["long escaped words", `## A x500\n|: "${"&".repeat(1800)}" C :| x2\n`],
	["many tacet parts", `${parts(30)}\n## A x165\nP0 |: C :| x2\n`],
	[
		"a part's silent lines",
		`part: P = Piano\n## A x1200\nP.A |: {C4} :| x2\nP.B |: {C3} :| x2\nP.C |: {C2} :| x2\nP.D |: {C1} :| x2\n`,
	],
	["the finding's lyric row", `## A x50\n|: C :| x2\nlyrics: | ${"la ".repeat(500)}|\n`],
	["text lines", `## A x2500\n${"Play it softly. ".repeat(100)}\n|: C :| x2\n`],
];

// Each test exports megabytes, some several times: the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = TIMING_TIMEOUT;

describe("maxLength", () => {
	test(
		"unset, or past the score's length, changes nothing",
		() => {
			for (const [, text] of SHAPES) {
				const full = exportMusicXml(text);
				if (!full.ok) throw new Error(full.diagnostics[0]?.message);
				expect(exportMusicXml(text, { maxLength: full.xml.length })).toEqual(full);
			}
		},
		TIMEOUT,
	);

	test("one character short, the export says the score is too large, and never throws", () => {
		const text = SHAPES[0]?.[1] as string;
		const full = exportMusicXml(text);
		if (!full.ok) throw new Error("no export");
		const r = exportMusicXml(text, { maxLength: full.xml.length - 1 });
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.tooLarge).toBe(true);
		expect(r.diagnostics[0]).toMatchObject({
			line: 0,
			severity: "error",
			message: `the MusicXML would be longer than ${full.xml.length - 1} characters`,
		});
	});

	for (const [name, text] of SHAPES)
		test(
			`${name}: stops writing at the limit, well before the whole score`,
			() => {
				const full = exportMusicXml(text);
				if (!full.ok) throw new Error(full.diagnostics[0]?.message);
				expect(full.xml.length).toBeGreaterThan(1_500_000);
				const cut = () => exportMusicXml(text, { maxLength: 100_000 });
				expect(cut()).toMatchObject({ ok: false, tooLarge: true });
				// A twentieth of the score written at most, the measures' text never built: an export that
				// didn't stop would take as long as the whole one (a ratio of 1). Read and walk are shared, so
				// a part's silent lines measure 2.7 alone and as little as 1.8 at load 20: hence 1.5. Two cut
				// exports a run against one whole, so both runs last about as long under load.
				expect(growth(cut, () => exportMusicXml(text), { runs: 5, balance: 2 })).toBeGreaterThan(
					1.5,
				);
			},
			TIMEOUT,
		);
});
