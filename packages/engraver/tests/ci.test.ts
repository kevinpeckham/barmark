/** The CI wiring around the engraver build: committed state only. */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
type Step = { if?: string; run?: string; uses?: string; with?: Record<string, string> };
const action = Bun.YAML.parse(read("../../../.github/actions/engraver-build/action.yml")) as {
	runs: { steps: Step[] };
};
const steps = action.runs.steps;
const at = (find: (s: Step) => boolean) => steps.findIndex(find);

test("every compile also runs source.sh after the gate, and checks both tarballs", () => {
	const gate = at((s) => s.run?.includes("bun scripts/engraver-equivalence.ts") ?? false);
	const compile = at((s) => s.run?.trim() === "bun run compile");
	const source = at((s) => s.run?.includes('build/source.sh "$RUNNER_TEMP/source"') ?? false);
	expect(gate).toBeGreaterThan(-1);
	expect(source).toBeGreaterThan(gate);
	// Only when the action compiled: a dist-cache hit has no Verovio clone.
	expect(steps[source]?.if).toBe(steps[compile]?.if);
	expect(steps[compile]?.if).toBe("steps.dist.outputs.cache-hit != 'true'");
	const run = steps[source]?.run ?? "";
	for (const s of ["engraver-build-", "build.sh", "versions.env", "-source.tar.gz"])
		expect(run).toContain(s);
});
test("the action uploads nothing from the Corresponding Source", () => {
	for (const s of steps.filter((s) => s.uses?.startsWith("actions/upload-artifact")))
		expect(s.with?.path ?? "").not.toContain("source");
});
test("Dependabot updates the actions the local composite actions pin", () => {
	const config = Bun.YAML.parse(read("../../../.github/dependabot.yml")) as {
		updates: { "package-ecosystem": string; directory?: string; directories?: string[] }[];
	};
	const entry = config.updates.find((u) => u["package-ecosystem"] === "github-actions");
	const dirs = entry?.directories ?? [entry?.directory];
	expect(dirs).toContain("/");
	const local = readdirSync(new URL("../../../.github/actions/", import.meta.url));
	expect(local.length).toBeGreaterThan(0);
	for (const name of local)
		expect(dirs.some((d) => d === `/.github/actions/${name}` || d === "/.github/actions/*")).toBe(
			true,
		);
});

// A job that downloads the engraver's dist has the .mjs and .wasm but not the
// TS side (dist/info.js), which only `bun run build` writes; `bun test` then
// runs the smoke test against a half-built dist. CI's `check` job never has
// the dist, so only reading the workflows catches the order (FINDINGS
// 2026-11-10).
test("every job with the engraver's dist builds it before bun test", () => {
	type Job = { steps?: Step[] };
	const checked: string[] = [];
	for (const file of ["release.yml", "ci.yml"]) {
		const workflow = Bun.YAML.parse(read(`../../../.github/workflows/${file}`)) as {
			jobs: Record<string, Job>;
		};
		for (const [name, job] of Object.entries(workflow.jobs)) {
			const steps = job.steps ?? [];
			const download = steps.findIndex(
				(s) => s.uses?.startsWith("actions/download-artifact") && s.with?.name === "engraver-dist",
			);
			if (download < 0) continue;
			steps.forEach((s, i) => {
				if (i < download || !/^bun test\b/.test(s.run?.trim() ?? "")) return;
				const built = steps.slice(download, i).some((b) => b.run?.trim() === "bun run build");
				checked.push(`${file} ${name}`);
				expect(built ? "" : `${file} ${name}: bun test before bun run build`).toBe("");
			});
		}
	}
	// release.yml's verify runs bun test with the dist: the rule has something to check.
	expect(checked).toContain("release.yml verify");
});
