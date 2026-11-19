/**
 * "Never throws", under Node (Bun's argument limit is far higher than V8's,
 * so a spread of a large array into a call passes under Bun and throws
 * here). The built package runs in a Node child; the charts are made there,
 * in memory.
 */
import { beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { distinctNames } from "./names.js";

const PACKAGE = join(import.meta.dir, "..");
const ROOT = join(PACKAGE, "../..");

beforeAll(() => {
	// The libraries first when they are not built, then this package.
	for (const dir of [join(ROOT, "packages/barmark"), join(ROOT, "packages/fretboard"), PACKAGE])
		if (!existsSync(join(dir, "dist/index.js")) || dir === PACKAGE) {
			const build = Bun.spawnSync(["bun", "run", "build"], { cwd: dir });
			if (build.exitCode !== 0) throw new Error(build.stderr.toString());
		}
}, 120_000);

/** Run `body` (module code that may use `exportLyricsheet` and `text`, read from stdin) in Node. */
function node(body: string, stdin = "", flags: string[] = []) {
	const entry = pathToFileURL(join(PACKAGE, "dist/index.js")).href;
	const code = `import { exportLyricsheet } from ${JSON.stringify(entry)};
import { readFileSync } from "node:fs";
const text = readFileSync(0, "utf8");
${body}`;
	const run = Bun.spawnSync(["node", ...flags, "--input-type=module", "-e", code], {
		cwd: PACKAGE,
		stdin: new TextEncoder().encode(stdin),
	});
	return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
}

const REPORT = `console.log(JSON.stringify({ ok: r.ok, why: r.ok ? "" : r.diagnostics.slice(0, 2), defines: r.ok ? r.text.split("\\n").filter((l) => l.startsWith("{define:")).length : 0 }));`;

test("under Node, 140,000 distinct chord names with diagrams export without throwing", () => {
	const names = distinctNames();
	expect(names.length).toBeGreaterThan(140_000);
	// At most 10,000 bars play: forty chords to a bar.
	const bars = Array.from({ length: Math.ceil(names.length / 40) }, (_, i) =>
		names.slice(i * 40, i * 40 + 40).join(" "),
	);
	const chart = `# T\n## A\n| ${bars.join(" | ")} |\n`;
	// About 100,000 of them have a shape. V8's default stack takes that many call
	// arguments or not, by machine; a smaller stack (the kilobytes given) makes the limit sure.
	const r = node(`const r = exportLyricsheet(text, { diagrams: "guitar" });\n${REPORT}`, chart, [
		"--stack-size=400",
	]);
	expect(r.err).toBe("");
	expect(r.code).toBe(0);
	expect(r.out.slice(0, 400)).toContain('"ok":true');
}, 300_000);

test("under Node, 200,000 text lines before the first section export without throwing", () => {
	const lines = Array.from({ length: 200_000 }, (_, i) => `Play it softly ${i}.`);
	const r = node(
		`const r = exportLyricsheet(text);\n${REPORT}`,
		`# T\n${lines.join("\n")}\n## A\n| C |\n`,
	);
	expect(r.err).toBe("");
	expect(r.code).toBe(0);
	expect(r.out.slice(0, 400)).toContain('"ok":true');
}, 120_000);

test("under Node, a bar of 200,000 slots, and 200,000 diagnostics, do not throw", () => {
	const slots = node(
		`const r = exportLyricsheet(text, { diagrams: "guitar" });\n${REPORT}`,
		`# T\n| ${"C ".repeat(200_000)}|\nlyrics: | la |\n`,
	);
	expect(slots.err).toBe("");
	expect(slots.code).toBe(0);
	const refused = node(
		"const r = exportLyricsheet(text);\nconsole.log(JSON.stringify({ ok: r.ok }));",
		`# T\n${"| [bad |\n".repeat(200_000)}`,
	);
	expect(refused.err).toBe("");
	expect(JSON.parse(refused.out).ok).toBe(false);
}, 120_000);
