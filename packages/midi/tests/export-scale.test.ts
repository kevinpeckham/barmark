/** A long chart exports in time linear in its length (Review Focus 6). */
import { expect, test } from "bun:test";
import { parseMidi } from "midi-file";
import { exportMidi } from "../src/index.js";

// The ratio is of best-of-three timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 60_000;

const CHORDS = ["C", "F", "G7", "Am", "Dm7", "Em", "Bb", "E7"];

/** `bars` bars of two parts, four chords a bar each, and a sung melody with a syllable on every beat. */
function chart(bars: number): string {
	const out = [
		"# Scale",
		"part: Gtr = Electric Guitar 1",
		"part: Vo = Voice, instrument: voice",
		"key: C, tempo: 100",
		"",
	];
	for (let b = 0; b < bars; b += 4) {
		const gtr: string[] = [];
		const vo: string[] = [];
		const mel: string[] = [];
		for (let i = 0; i < Math.min(4, bars - b); i++) {
			const chord = (k: number) => CHORDS[(b + i + k) % CHORDS.length];
			gtr.push(` ${chord(0)} ${chord(1)} ${chord(2)} ${chord(3)} `);
			vo.push(` ${chord(4)} ${chord(5)} ${chord(6)} ${chord(7)} `);
			mel.push(" {C4}:la {D4}:la- {E4}:di {F4}:da ");
		}
		out.push(
			`Gtr    |${gtr.join("|")}|`,
			`Vo     |${vo.join("|")}|`,
			`Vo.Mel |${mel.join("|")}|`,
			"",
		);
	}
	return out.join("\n");
}

/** The best of three exports of `text`, after one to warm up, and the file the last one wrote. */
function timed(text: string): { ms: number; bytes: Uint8Array } {
	exportMidi(chart(4));
	let ms = Number.POSITIVE_INFINITY;
	let bytes: Uint8Array = new Uint8Array();
	for (let run = 0; run < 3; run++) {
		const start = performance.now();
		const r = exportMidi(text);
		ms = Math.min(ms, performance.now() - start);
		if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
		bytes = r.bytes;
	}
	return { ms, bytes };
}

/** Note-ons and lyric events across the file, to show the long export wrote everything. */
function counts(bytes: Uint8Array): { ons: number; lyrics: number } {
	const events = parseMidi(bytes).tracks.flat();
	return {
		ons: events.filter((e) => e.type === "noteOn" && e.velocity > 0).length,
		lyrics: events.filter((e) => e.type === "lyrics").length,
	};
}

test(
	"a 1,000-bar chart of two parts and lyrics exports in linear time",
	() => {
		const small = timed(chart(100));
		const large = timed(chart(1000));
		// Each bar the two parts play all eight chords (35 notes: a bass under each chord tone) and the melody 4.
		expect(counts(large.bytes)).toEqual({ ons: 1000 * 39, lyrics: 1000 * 4 });
		// Ten times the bars, at most twenty times as long.
		expect(large.ms / small.ms).toBeLessThan(20);
	},
	TIMEOUT,
);
