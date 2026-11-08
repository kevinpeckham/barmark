/**
 * scripts/verify-release.ts's check for the CLI: each bundled library's
 * dependency ranges, as packed at its tag, admit the versions the binaries
 * bundle. Here because the root `bun test` runs packages/ only.
 */
import { describe, expect, test } from "bun:test";
import { packedRange, staleRange, staleRanges } from "../../../scripts/packed-range.js";

describe("packedRange: a dependency as bun pm pack writes it", () => {
	test("workspace ranges take the dependency's version at the tag", () => {
		expect(packedRange("workspace:^", "0.2.0")).toBe("^0.2.0");
		expect(packedRange("workspace:~", "0.2.0")).toBe("~0.2.0");
		expect(packedRange("workspace:*", "0.2.0")).toBe("0.2.0");
		expect(packedRange("workspace:", "0.2.0")).toBe("0.2.0");
	});
	test("any other range packs as written", () => {
		expect(packedRange("^1.4.0", "0.2.0")).toBe("^1.4.0");
		expect(packedRange("workspace:^1.0.0", "0.2.0")).toBe("^1.0.0");
	});
});

describe("staleRange: npm users of the library get the bundled version", () => {
	const midi = { name: "@barmark/midi", tag: "midi-v0.2.0" };
	test("a sync minor with no midi release is a problem", () => {
		expect(staleRange(midi, "@barmark/sync", "^0.2.0", "0.3.0")).toBe(
			"@barmark/midi at midi-v0.2.0 depends on @barmark/sync ^0.2.0, which does not admit the bundled 0.3.0: release a @barmark/midi patch first (Requires @barmark/sync 0.3.0)",
		);
	});
	test("a sync patch, or the same version, is not", () => {
		expect(staleRange(midi, "@barmark/sync", "^0.2.0", "0.2.4")).toBeNull();
		expect(staleRange(midi, "@barmark/sync", "^0.2.0", "0.2.0")).toBeNull();
	});
	test("a barmark minor behind a dependant's caret is caught the same way", () => {
		const render = { name: "@barmark/render", tag: "render-v0.17.0" };
		expect(staleRange(render, "barmark", "^0.20.0", "0.21.0")).toContain(
			"release a @barmark/render patch first (Requires barmark 0.21.0)",
		);
	});
});

describe("staleRanges: a library's dependencies at its tag", () => {
	test("only the libraries it knows, each packed with its version at the tag", () => {
		const versions: Record<string, { atTag: string; local: string }> = {
			barmark: { atTag: "0.21.0", local: "0.21.3" },
			"@barmark/sync": { atTag: "0.2.0", local: "0.3.0" },
		};
		const problems = staleRanges(
			{ name: "@barmark/midi", tag: "midi-v0.2.0" },
			{ barmark: "workspace:^", "@barmark/sync": "workspace:^", "midi-file": "^1.0.0" },
			(name) => versions[name],
		);
		expect(problems).toEqual([
			"@barmark/midi at midi-v0.2.0 depends on @barmark/sync ^0.2.0, which does not admit the bundled 0.3.0: release a @barmark/midi patch first (Requires @barmark/sync 0.3.0)",
		]);
	});
});
