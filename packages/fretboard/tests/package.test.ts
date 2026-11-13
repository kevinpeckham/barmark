import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GUITAR } from "../src/index.js";

test("standard tuning, low string first", () => {
	expect(GUITAR).toEqual({ name: "guitar", strings: [40, 45, 50, 55, 59, 64] });
	expect(Object.isFrozen(GUITAR)).toBe(true);
	expect(Object.isFrozen(GUITAR.strings)).toBe(true);
});

test("the package depends on barmark alone, with a caret", () => {
	const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
	expect(pkg.name).toBe("@barmark/fretboard");
	expect(pkg.version).toBe("0.1.0");
	expect(pkg.dependencies).toEqual({ barmark: "workspace:^" });
	expect(pkg.sideEffects).toBe(false);
	expect(pkg.license).toBe("MIT");
});
