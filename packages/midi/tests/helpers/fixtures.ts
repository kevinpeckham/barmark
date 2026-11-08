import { readFileSync } from "node:fs";

/**
 * The MuseScore files under `tests/fixtures/`: each `.mid` MuseScore 4
 * wrote from one of our `.mscx` scores (ours here, or the musicxml
 * package's import fixtures), and the `.chart.md` it imports to, read
 * over by hand. `bun scripts/midi-fixtures.ts` regenerates them on the
 * VM; CI reads them.
 */
export const MIDI_FIXTURES = [
	"lead-sheet",
	"band",
	"hymn",
	"comping-guitar",
	"piano",
	"piano-comping",
	"bass-and-chords",
] as const;

const DIR = new URL("../fixtures/", import.meta.url);

/** A fixture's `.mid` bytes. */
export const fixtureBytes = (name: string) =>
	new Uint8Array(readFileSync(new URL(`${name}.mid`, DIR)));

/** A fixture's expected chart. */
export const fixtureChart = (name: string) =>
	readFileSync(new URL(`${name}.chart.md`, DIR), "utf8");
