import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { readVersions } from "../build/facts.js";
import pkg from "../package.json";

// Committed state only: no build needed.
const read = (path: string) => {
	const url = new URL(path, import.meta.url);
	return existsSync(url) ? readFileSync(url, "utf8") : "";
};
const versions = readVersions(read("../build/versions.env"));
const buildSh = read("../build/build.sh");
const dataEntries = read("../build/data.txt").split("\n").filter(Boolean);
const notice = read("../NOTICE.md");
const readme = read("../README.md");
const verovioVersion = versions.VEROVIO_TAG.replace("version-", "");

test("NOTICE.md names both versions, the commit, the date and this release's source", () => {
	for (const s of [
		verovioVersion,
		versions.VEROVIO_COMMIT.slice(0, 8),
		`emcc ${versions.EMSDK_VERSION}`,
		`Modified ${versions.MODIFIED}`,
		`https://github.com/kevinpeckham/barmark/releases/tag/engraver-v${pkg.version}`,
		"https://github.com/kevinpeckham/barmark/issues",
		`verovio-${verovioVersion}-source.tar.gz`,
		"build/source.sh",
		"verovio-module-hum.mjs",
	])
		expect(notice).toContain(s);
});
test("NOTICE.md names every importer build.sh turns off", () => {
	const names = [...buildSh.matchAll(/-DNO_(\w+)_SUPPORT=ON/g)].map(([, name]) => name ?? "");
	expect(names.length).toBeGreaterThan(0);
	for (const name of names) expect(notice.toUpperCase()).toContain(name);
});
test("NOTICE.md names every flag that changes the build", () => {
	for (const s of [
		versions.OPT,
		"Closure",
		"build paths mapped",
		"separate file",
		"instantiateWasm",
		"INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm",
		"CMAKE_INSTALL_PREFIX=/usr/local",
	])
		expect(notice).toContain(s);
	// build.sh sets both, so a change there must reach NOTICE.md.
	expect(buildSh).toContain("INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm");
	expect(buildSh).toContain("-DCMAKE_INSTALL_PREFIX=/usr/local");
});
test("NOTICE.md names every data entry kept", () => {
	expect(dataEntries.length).toBeGreaterThan(0);
	for (const e of dataEntries) expect(notice).toContain(`\`${e}\``);
});
test("NOTICE.md credits Leipzig and Bravura under the OFL", () => {
	for (const s of ["Leipzig", "Bravura", "SIL Open Font License", "OFL.txt"])
		expect(notice).toContain(s);
});
test("the README's first line says what it is", () => {
	expect(readme.split("\n")[0]).toBe(
		`A modified build of Verovio ${verovioVersion} (LGPL-3.0-only), made by barmark, not by the Verovio project.`,
	);
});
test("the README names both differences from stock and links NOTICE.md and the source", () => {
	for (const s of [
		"INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm",
		"CMAKE_INSTALL_PREFIX=/usr/local",
		"NOTICE.md",
		`https://github.com/kevinpeckham/barmark/releases/tag/engraver-v${pkg.version}`,
	])
		expect(readme).toContain(s);
});
test("the licence texts are Verovio's own", () => {
	const copying = read("../COPYING");
	const lesser = read("../COPYING.LESSER");
	expect(copying.trimStart().startsWith("GNU GENERAL PUBLIC LICENSE")).toBe(true);
	expect(copying).toContain("Version 3, 29 June 2007");
	expect(lesser.trimStart().startsWith("GNU LESSER GENERAL PUBLIC LICENSE")).toBe(true);
	expect(lesser).toContain("Version 3, 29 June 2007");
	// The CLI attaches the same texts beside its binaries, from the same tag.
	expect(copying).toBe(read("../../cli/licenses/Verovio-GPL-3.0.txt"));
	expect(lesser).toBe(read("../../cli/licenses/Verovio-LGPL-3.0.txt"));
});
test("OFL.txt names both fonts, their sources and what derives from them", () => {
	const ofl = read("../OFL.txt");
	for (const s of [
		'Reserved Font Name "Leipzig"',
		'Reserved Font Name "Bravura"',
		"https://github.com/rism-digital/leipzig",
		"https://github.com/steinbergmedia/bravura",
		"SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007",
		...dataEntries.filter((e) => e !== "text"),
	])
		expect(ofl).toContain(s);
});
// Leipzig's LICENSE.txt at rism-digital/leipzig 08d99233037c6f73a27920c56ce39966290eedb1,
// 4,437 bytes: OFL.txt carries it verbatim, from its copyright line to the end.
const LEIPZIG_LICENSE_SHA256 = "77b3d0cfb6fa5f4784d64b9ddabffc1f8c9544b0389c4a13088e7b94defe1763";
test("OFL.txt ends with Leipzig's upstream LICENSE.txt, byte for byte", () => {
	const bytes = readFileSync(new URL("../OFL.txt", import.meta.url));
	const start = bytes.indexOf("Copyright (c) 2014, Etienne Darbellay");
	expect(start).toBeGreaterThan(0);
	const tail = bytes.subarray(start);
	expect(tail.length).toBe(4437);
	expect(new Bun.CryptoHasher("sha256").update(tail).digest("hex")).toBe(LEIPZIG_LICENSE_SHA256);
});
test("OFL.txt cites Bravura by its release tag", () => {
	const ofl = read("../OFL.txt");
	expect(ofl).toContain("bravura-1.392");
	expect(ofl).not.toContain("354f353");
});
test("THIRD-PARTY.md names Emscripten, the vendored libraries and what Verovio records of data/text", () => {
	const third = read("../THIRD-PARTY.md");
	for (const s of [
		"Emscripten",
		"University of Illinois/NCSA",
		"musl",
		"libc++",
		"compiler-rt",
		"pugixml",
		"JSON++",
		"MidiFile",
		"miniz",
		"tuning-library",
		"data/text/",
	])
		expect(third).toContain(s);
	// One bullet, read as prose: data/text/ is Verovio's, under Verovio's licence, not OFL.
	const text = third
		.replace(/\s+/g, " ")
		.split(" - ")
		.find((b) => b.startsWith("`data/text/`"));
	expect(text).toContain("Verovio-derived data under Verovio's licence");
	expect(text).toContain("not under the OFL");
});
test("the package publishes the licence files", () => {
	for (const f of ["COPYING", "COPYING.LESSER", "OFL.txt", "THIRD-PARTY.md", "NOTICE.md"])
		expect(pkg.files).toContain(f);
});
