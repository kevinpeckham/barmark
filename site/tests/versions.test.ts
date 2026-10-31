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
