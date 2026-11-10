import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	checkDist,
	factsOf,
	type Info,
	infoProblems,
	readVersions,
	renderInfo,
	type Versions,
} from "../build/facts.js";

const enc = (s: string) => new TextEncoder().encode(s);
const versions: Versions = {
	VEROVIO_TAG: "version-6.4.1",
	VEROVIO_COMMIT: "fbe8f4695ab0a123cb096e0cf92354b44f7a2fb8",
	EMSDK_VERSION: "7.0.0",
	EMSDK_COMMIT: "1693ce7359fc9694f198694f902a2cc061239b86",
	CMAKE_VERSION: "4.4.4",
	OPT: "-Oz",
	MODIFIED: "2026-11-10",
};

test("sizes and sha384 digests", () => {
	const f = factsOf(enc("abc"), new Uint8Array([0, 1]));
	expect(f.moduleBytes).toBe(3);
	expect(f.wasmBytes).toBe(2);
	expect(f.moduleIntegrity).toBe(
		"sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
	);
});

test("a stale dist names the file, both digests and the fix", () => {
	const info = {
		MODULE_BYTES: 3,
		WASM_BYTES: 2,
		MODULE_INTEGRITY: "sha384-A",
		WASM_INTEGRITY: "sha384-B",
	};
	const problems = infoProblems(
		{ moduleBytes: 3, wasmBytes: 5, moduleIntegrity: "sha384-A", wasmIntegrity: "sha384-C" },
		info,
	);
	expect(problems).toHaveLength(1);
	const [p] = problems;
	expect(p).toContain("verovio-module.wasm");
	expect(p).toContain("5 bytes, sha384-C");
	expect(p).toContain("2 bytes, sha384-B");
	expect(p).toContain("bun run compile");
});

test("matching facts have no problems", () => {
	const facts = factsOf(enc("abc"), new Uint8Array([0, 1]));
	const info: Info = {
		MODULE_BYTES: facts.moduleBytes,
		WASM_BYTES: facts.wasmBytes,
		MODULE_INTEGRITY: facts.moduleIntegrity,
		WASM_INTEGRITY: facts.wasmIntegrity,
	};
	expect(infoProblems(facts, info)).toEqual([]);
});

test("renderInfo round-trips through the module it writes", async () => {
	const facts = factsOf(enc("abc"), new Uint8Array([0, 1]));
	const dir = mkdtempSync(join(tmpdir(), "engraver-info-"));
	try {
		const path = join(dir, "info.ts");
		writeFileSync(path, renderInfo(facts, versions, "9.8.7"));
		const info = await import(path);
		expect(info.VEROVIO_VERSION).toBe("6.4.1");
		expect(info.VEROVIO_COMMIT).toBe(versions.VEROVIO_COMMIT);
		expect(info.MODULE_BYTES).toBe(3);
		expect(info.WASM_BYTES).toBe(2);
		expect(info.MODULE_INTEGRITY).toBe(facts.moduleIntegrity);
		expect(info.WASM_INTEGRITY).toBe(facts.wasmIntegrity);
		expect(info.WASM_FILE).toBe("verovio-module.wasm");
		expect(info.CDN_URL).toBe(
			"https://cdn.jsdelivr.net/npm/@barmark/engraver@9.8.7/dist/verovio-module.mjs",
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("renderInfo says what writes it", () => {
	expect(renderInfo(factsOf(enc("a"), enc("b")), versions, "0.1.0")).toContain(
		"bun run compile --update",
	);
});

test("a versions.env missing a key is refused by name", () => {
	expect(() => readVersions("VEROVIO_TAG=version-6.4.1\n")).toThrow("VEROVIO_COMMIT");
});

test("readVersions reads KEY=value lines", () => {
	const text = `${Object.entries(versions)
		.map(([k, v]) => `${k}=${v}`)
		.join("\n")}\n`;
	expect(readVersions(text)).toEqual(versions);
});

// checkDist: what `bun run build` (and prepack, with requireModule) says of dist/.
function distWith(files: Record<string, Uint8Array>): string {
	const dir = mkdtempSync(join(tmpdir(), "engraver-dist-"));
	mkdirSync(dir, { recursive: true });
	for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes);
	return dir;
}
const mjs = enc("abc");
const wasm = new Uint8Array([0, 1]);
const facts = factsOf(mjs, wasm);
const info: Info = {
	MODULE_BYTES: facts.moduleBytes,
	WASM_BYTES: facts.wasmBytes,
	MODULE_INTEGRITY: facts.moduleIntegrity,
	WASM_INTEGRITY: facts.wasmIntegrity,
};

test("a dist with no compiled module passes the build, with a note saying how to get one", () => {
	const dir = distWith({});
	const result = checkDist(dir, info, false);
	expect(result.problems).toEqual([]);
	expect(result.notes.join("\n")).toContain("bun run compile");
	expect(result.notes.join("\n")).toContain("engraver-dist");
	rmSync(dir, { recursive: true, force: true });
});

test("prepack refuses a dist with no compiled module", () => {
	const dir = distWith({});
	expect(checkDist(dir, info, true).problems.join("\n")).toContain("bun run compile");
	rmSync(dir, { recursive: true, force: true });
});

test("a dist with only one of the two files is refused, naming the missing one", () => {
	const dir = distWith({ "verovio-module.mjs": mjs });
	const { problems } = checkDist(dir, info, false);
	expect(problems.join("\n")).toContain("verovio-module.wasm");
	rmSync(dir, { recursive: true, force: true });
});

test("a dist matching info.ts passes; a stale one fails", () => {
	const good = distWith({ "verovio-module.mjs": mjs, "verovio-module.wasm": wasm });
	expect(checkDist(good, info, true).problems).toEqual([]);
	const stale = distWith({ "verovio-module.mjs": mjs, "verovio-module.wasm": enc("xyz") });
	expect(checkDist(stale, info, true).problems.join("\n")).toContain("verovio-module.wasm");
	rmSync(good, { recursive: true, force: true });
	rmSync(stale, { recursive: true, force: true });
});

test("a directory in place of a compiled file is refused by name, not thrown", () => {
	const dir = distWith({ "verovio-module.mjs": mjs });
	mkdirSync(join(dir, "verovio-module.wasm"));
	const { problems } = checkDist(dir, info, false);
	expect(problems.join("\n")).toContain("verovio-module.wasm");
	rmSync(dir, { recursive: true, force: true });
});
