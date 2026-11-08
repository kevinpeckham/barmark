/**
 * The barmark command as a standalone binary (`bun build --compile`): the
 * font and the versions are embedded, so it runs with nothing installed.
 */
import barmark from "../../barmark/package.json" with { type: "json" };
import midi from "../../midi/package.json" with { type: "json" };
import musicxml from "../../musicxml/package.json" with { type: "json" };
import fontPath from "../../render/fonts/Edwin-Roman.otf" with { type: "file" };
import render from "../../render/package.json" with { type: "json" };
import cli from "../package.json" with { type: "json" };
import { main } from "./main.js";
import { processIo } from "./node-io.js";

const font = await Bun.file(fontPath).bytes();
const io = {
	...processIo(),
	font: () => font,
	versions: {
		cli: cli.version,
		barmark: barmark.version,
		render: render.version,
		musicxml: musicxml.version,
		midi: midi.version,
	},
};
process.exitCode = await main(process.argv.slice(2), io);
