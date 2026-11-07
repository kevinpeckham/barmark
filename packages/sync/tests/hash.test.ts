import { describe, expect, test } from "bun:test";
import { fnv1a64 } from "../src/timing/hash.js";
import { chartHash } from "../src/timing/index.js";

describe("FNV-1a 64 test vectors", () => {
	test.each([
		["", "cbf29ce484222325"],
		["a", "af63dc4c8601ec8c"],
		["foobar", "85944171f73967e8"],
		["| C |\n", "c69999f63a2ad360"],
		["# Café\n| C |\n", "8b0d0da57b7bd60b"],
	])("%j", (text, hash) => {
		expect(fnv1a64(text)).toBe(hash);
	});
});

test("chartHash hashes the printed chart", () => {
	expect(chartHash("|C|")).toBe(chartHash("| C |\n"));
	expect(chartHash("| C |\n")).toBe("c69999f63a2ad360");
});

test("it hashes the UTF-8 bytes TextEncoder gives, for every width and a lone surrogate", () => {
	const text = "a é € 😀 \ud800 end";
	const bytes = new TextEncoder().encode(text);
	let h = 0xcbf29ce484222325n;
	for (const b of bytes) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
	expect(fnv1a64(text)).toBe(h.toString(16).padStart(16, "0"));
});
