/**
 * The barmark command as a standalone binary (`bun build --compile`): the
 * font, Verovio and the versions are embedded, so it runs with nothing installed.
 */

// Verovio's module (7.4 MB) as an embedded file, imported by path on the first score only: bundled
// in, it would be parsed at every start.
import verovioModule from "verovio/wasm" with { type: "file" };
import barmark from "../../barmark/package.json" with { type: "json" };
import midi from "../../midi/package.json" with { type: "json" };
import musicxml from "../../musicxml/package.json" with { type: "json" };
import fontPath from "../../render/fonts/Edwin-Roman.otf" with { type: "file" };
import render from "../../render/package.json" with { type: "json" };
import score from "../../score/package.json" with { type: "json" };
import cli from "../package.json" with { type: "json" };
import type { VerovioFactory } from "./io.js";
import { main } from "./main.js";
import { processIo } from "./node-io.js";

const font = await Bun.file(fontPath).bytes();
const io = {
	...processIo(),
	font: () => font,
	verovio: async () =>
		((await import(verovioModule as unknown as string)) as { default: VerovioFactory }).default,
	versions: {
		cli: cli.version,
		barmark: barmark.version,
		render: render.version,
		musicxml: musicxml.version,
		score: score.version,
		midi: midi.version,
		// Exact by policy (verify:release checks it against @barmark/score); its own package.json is outside verovio's exports.
		verovio: cli.dependencies.verovio,
	},
};
process.exitCode = await main(process.argv.slice(2), io);
