import { afterEach, describe, expect, test } from "bun:test";
import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outDir, writeFresh } from "../../../scripts/out-dir.js";

const made: string[] = [];
const scratch = () => {
	const d = mkdtempSync(join(tmpdir(), "out-dir-test-"));
	made.push(d);
	return d;
};
afterEach(() => {
	for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("outDir", () => {
	test("with no argument, a new private folder under tmpdir each time", () => {
		const a = outDir(undefined, "score-dorico-");
		const b = outDir(undefined, "score-dorico-");
		made.push(a, b);
		expect(a).not.toBe(b);
		expect(a.startsWith(join(tmpdir(), "score-dorico-"))).toBe(true);
		expect(lstatSync(a).mode & 0o777).toBe(0o700);
	});

	test("a given folder is made if missing and used", () => {
		const d = join(scratch(), "new");
		expect(outDir(d, "x-")).toBe(d);
		expect(lstatSync(d).isDirectory()).toBe(true);
	});

	test("a given folder that is a symlink is refused", () => {
		const d = scratch();
		const link = join(d, "link");
		symlinkSync(scratch(), link);
		expect(() => outDir(link, "x-")).toThrow(/not a folder/);
	});
});

describe("writeFresh", () => {
	test("replaces a symlink at the path, never writing through it", () => {
		const d = scratch();
		const target = join(d, "victim.txt");
		writeFileSync(target, "keep");
		const path = join(d, "out.musicxml");
		symlinkSync(target, path);
		writeFresh(path, "<score/>");
		expect(readFileSync(target, "utf8")).toBe("keep");
		expect(lstatSync(path).isSymbolicLink()).toBe(false);
		expect(readFileSync(path, "utf8")).toBe("<score/>");
	});

	test("overwrites its own earlier file", () => {
		const path = join(scratch(), "index.html");
		writeFresh(path, "one");
		writeFresh(path, "two");
		expect(readFileSync(path, "utf8")).toBe("two");
	});
});
