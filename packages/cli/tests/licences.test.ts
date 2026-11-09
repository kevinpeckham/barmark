/** The binaries bundle Verovio (LGPL-3.0-only): its licence, and the GPL it builds on, go beside them. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./charts.js";

const LICENSES = join(ROOT, "packages/cli/licenses");
const RELEASE = readFileSync(join(ROOT, ".github/workflows/release.yml"), "utf8");

describe("Verovio's licence beside the binaries", () => {
	test("the LGPL and the GPL, as Verovio ships them", () => {
		expect(readFileSync(join(LICENSES, "Verovio-LGPL-3.0.txt"), "utf8")).toStartWith(
			"                   GNU LESSER GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007",
		);
		expect(readFileSync(join(LICENSES, "Verovio-GPL-3.0.txt"), "utf8")).toStartWith(
			"                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007",
		);
	});
	test("the release workflow attaches both, with Edwin's", () => {
		for (const file of ["Edwin-OFL.txt", "Verovio-LGPL-3.0.txt", "Verovio-GPL-3.0.txt"])
			expect(RELEASE).toContain(`"$RUNNER_TEMP/bin/${file}"`);
	});
});
