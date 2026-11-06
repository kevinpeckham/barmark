/** How the import breaks bars into systems. */
import { expect, test } from "bun:test";
import { exportMusicXml, importMusicXml } from "../../src/index.js";

/** The chart, exported and imported again. */
function back(chart: string): string {
	const exported = exportMusicXml(chart);
	if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
	return importMusicXml(exported.xml).text;
}

test("a pickup doesn't count toward a system's four bars", () => {
	expect(back("time: 3/4\n| [1/4] C | D | E | F | G | A |\n")).toBe(
		"time: 3/4\n| [1/4] C | D | E | F | G |\n| A |\n",
	);
});
