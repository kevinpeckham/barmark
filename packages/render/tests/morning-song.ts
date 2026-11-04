import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The spec's example of several parts (grammar 7.4), from examples/. */
export const MORNING_SONG = readFileSync(
	join(import.meta.dir, "../../../examples/morning-song.chart.md"),
	"utf8",
);
