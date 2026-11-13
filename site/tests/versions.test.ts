import { describe, expect, test } from "bun:test";
import { behind, latestTag } from "../scripts/check-versions.ts";

describe("latestTag", () => {
	test("orders by semver, not by string", () => {
		expect(
			latestTag(["barmark-v0.1.0", "v0.1.0", "barmark-v0.2.0", "barmark-v0.10.0"], "barmark-v"),
		).toBe("barmark-v0.10.0");
	});
	test("is null when nothing has the prefix", () => {
		expect(latestTag(["v0.1.0"], "render-v")).toBeNull();
	});
	test("ignores tags that aren't versions", () => {
		expect(latestTag(["render-v0.1.0", "render-vnext"], "render-v")).toBe("render-v0.1.0");
	});
});

describe("behind", () => {
	const pins = { barmark: "0.2.0", "@barmark/render": "0.1.0" };
	test("names a package whose release is newer than the site's pin", () => {
		expect(behind(pins, ["barmark-v0.3.0", "render-v0.1.0"])).toEqual(["barmark 0.2.0 < 0.3.0"]);
	});
	test("is empty when the site runs the latest releases", () => {
		expect(behind(pins, ["barmark-v0.2.0", "barmark-v0.1.0", "render-v0.1.0"])).toEqual([]);
	});
});

describe("the CLI", () => {
	test("its tags are cli-v, so the site's pin is checked too", () => {
		expect(behind({ "@barmark/cli": "0.1.0" }, ["cli-v0.2.0"])).toEqual([
			"@barmark/cli 0.1.0 < 0.2.0",
		]);
	});
});

describe("the score", () => {
	test("its tags are score-v, so the site's pin is checked too", () => {
		expect(behind({ "@barmark/score": "0.1.0" }, ["score-v0.1.1", "score-v0.1.0"])).toEqual([
			"@barmark/score 0.1.0 < 0.1.1",
		]);
	});
});

describe("the libraries Get Started documents", () => {
	// Get Started's snippets for these are tested against the site's dev dependencies, and their
	// `npm install` gets the latest release: a pin behind it would test an API readers don't install.
	test.each([
		["@barmark/musicxml", "musicxml-v"],
		["@barmark/sync", "sync-v"],
		["@barmark/midi", "midi-v"],
		["@barmark/listen", "listen-v"],
		["@barmark/fretboard", "fretboard-v"],
	])("%s is checked against its %s tags", (name, prefix) => {
		expect(behind({ [name]: "0.1.0" }, [`${prefix}0.2.0`])).toEqual([`${name} 0.1.0 < 0.2.0`]);
	});

	test("a package that isn't ours is never checked", () => {
		expect(
			behind({ verovio: "1.0.0", "@fontsource/noto-mono": "1.0.0" }, [
				"verovio-v2.0.0",
				"noto-mono-v2.0.0",
			]),
		).toEqual([]);
	});
});
