import { expect, test } from "bun:test";
import { absolutePaths } from "../build/paths.js";

const enc = (s: string) => new TextEncoder().encode(s);
test("Emscripten's virtual filesystem paths are not build paths", () => {
	expect(absolutePaths(enc('"/home/web_user" "/tmp" "/home" "/dev/null"'), [])).toEqual([]);
});
test("a real home, temp, opt, macOS or runner path is found", () => {
	for (const p of [
		"/home/exedev/x.cc",
		"/home/runner/work/a",
		"/tmp/claude-1000/v/jsonxx.cc",
		"/opt/emsdk/upstream",
		"/Users/kevin/x",
		"/__w/barmark/x",
	])
		expect(absolutePaths(enc(`\0${p}\0`), [])).toEqual([p]);
});
test("a literal (the source or emsdk root) is found wherever it sits", () => {
	expect(absolutePaths(enc("xx/srv/build/verovio/src/a.cc"), ["/srv/build/verovio"])).toEqual([
		"/srv/build/verovio",
	]);
});
