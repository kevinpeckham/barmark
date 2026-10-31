/**
 * Swamp behavior type for barmark's release checks: each method runs one of
 * the repo's own scripts (the same ones CI runs) and records what it found
 * as typed, versioned data. One definition, `barmark`, lives under models/;
 * the release-check workflow calls all four and asserts they are clean.
 * Pure scripts: no network beyond git and npm lookups, so no vault.
 */
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({
	label: z.string().default("barmark").describe("A name for the checkout being checked"),
});
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const GatesSchema = z.object({
	label: z.string(),
	checkedAt: z.string(),
	lint: z.boolean().describe("bun run check (Biome and tsc) exited 0"),
	tests: z.object({ pass: z.number().int(), fail: z.number().int(), ok: z.boolean() }),
	ok: z.boolean(),
	summary: z.string(),
	output: z.string().describe("The tail of any failing command's output"),
});

const PkgArg = z
	.enum(["barmark", "render"])
	.default("barmark")
	.describe("The workspace package to check: barmark or render (@barmark/render)");

const PackageSchema = z.object({
	label: z.string(),
	pkg: z.string(),
	checkedAt: z.string(),
	version: z.string(),
	files: z.number().int(),
	unpackedSize: z.number().int(),
	missing: z.array(z.string()),
	unexpected: z.array(z.string()),
	node: z
		.object({ bars: z.number(), diagnostics: z.number(), roundTrip: z.boolean(), harte: z.string().nullable() })
		.nullable(),
	ok: z.boolean(),
	summary: z.string(),
	problems: z.array(z.string()),
});

const ReleaseSchema = z.object({
	label: z.string(),
	pkg: z.string(),
	checkedAt: z.string(),
	version: z.string(),
	tag: z.string(),
	branch: z.string(),
	clean: z.boolean(),
	changelogDate: z.string().nullable(),
	ok: z.boolean(),
	summary: z.string(),
	problems: z.array(z.string()),
});

const HealthSchema = z.object({
	label: z.string(),
	checkedAt: z.string(),
	deadCode: z.number().int().describe("Unused files, exports, types and dependencies"),
	duplicatedLines: z.number().int(),
	newComplexity: z.number().int().describe("Complexity findings not in .fallow-health-baseline.json"),
	baselined: z.number().int().describe("Functions above threshold that the baseline accepts"),
	maintainability: z.number(),
	ok: z.boolean(),
	summary: z.string(),
	output: z.string().describe("The tail of fallow's report when it fails"),
});

type Context = {
	signal: AbortSignal;
	repoDir: string;
	globalArgs: GlobalArgs;
	logger: {
		info(msg: string, ...args: unknown[]): void;
		warning(msg: string, ...args: unknown[]): void;
	};
	writeResource: (
		specName: string,
		name: string,
		data: Record<string, unknown>,
	) => Promise<{ name: string }>;
};

async function run(context: Context, args: string[]) {
	context.logger.info("Running bun {args}", { args: args.join(" ") });
	const out = await new Deno.Command("bun", {
		args,
		cwd: context.repoDir,
		stdout: "piped",
		stderr: "piped",
		signal: context.signal,
	}).output();
	const decoder = new TextDecoder();
	return { code: out.code, stdout: decoder.decode(out.stdout), stderr: decoder.decode(out.stderr) };
}

const tail = (text: string, lines = 12) => text.trim().split("\n").slice(-lines).join("\n");

/** Run a verify script with --json and parse its result; a crash before it prints is an error. */
async function verify(context: Context, script: string, extra: string[] = []) {
	const r = await run(context, [script, "--json", ...extra]);
	const line = r.stdout.trim().split("\n").at(-1) ?? "";
	try {
		return JSON.parse(line) as Record<string, unknown> & { ok: boolean; problems: string[] };
	} catch {
		throw new Error(`${script} exited ${r.code} without a result:\n${tail(r.stderr || r.stdout, 6)}`);
	}
}

export const behavior = {
	type: "@kevin/barmark-checks",
	version: "2026.10.31.3",
	description: "barmark's release checks (lint, tests, Fallow, package, release readiness) run on the checkout and kept as data",
	globalArguments: GlobalArgsSchema,
	resources: {
		gates: {
			description: "Lint, typecheck and test results",
			schema: GatesSchema,
			lifetime: "infinite",
			garbageCollection: 30,
		},
		package: {
			description: "What npm would publish, and whether Node can import and run the build",
			schema: PackageSchema,
			lifetime: "infinite",
			garbageCollection: 30,
		},
		health: {
			description: "Fallow: dead code, duplication and complexity beyond the baseline",
			schema: HealthSchema,
			lifetime: "infinite",
			garbageCollection: 30,
		},
		release: {
			description: "Whether the checkout is ready to tag: version, CHANGELOG, tag, npm, clean main",
			schema: ReleaseSchema,
			lifetime: "infinite",
			garbageCollection: 30,
		},
	},
	methods: {
		gates: {
			description: "Run bun run check (Biome and tsc) and bun test, and record the counts",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: Context) => {
				const lint = await run(context, ["run", "check"]);
				const test = await run(context, ["test"]);
				const all = `${test.stdout}\n${test.stderr}`;
				const pass = Number(/(\d+) pass/.exec(all)?.[1] ?? 0);
				const fail = Number(/(\d+) fail/.exec(all)?.[1] ?? 0);
				const tests = { pass, fail, ok: test.code === 0 && fail === 0 && pass > 0 };
				const ok = lint.code === 0 && tests.ok;
				const data: z.infer<typeof GatesSchema> = {
					label: context.globalArgs.label,
					checkedAt: new Date().toISOString(),
					lint: lint.code === 0,
					tests,
					ok,
					summary: `lint ${lint.code === 0 ? "clean" : "failed"}; tests ${pass} pass, ${fail} fail`,
					output: [
						lint.code === 0 ? "" : tail(lint.stdout + lint.stderr),
						tests.ok ? "" : tail(all),
					]
						.filter(Boolean)
						.join("\n---\n"),
				};
				if (!ok) context.logger.warning("Gates failed: {summary}", data);
				return { dataHandles: [await context.writeResource("gates", "gates", data)] };
			},
		},
		package: {
			description: "Run scripts/verify-package.ts for one package: build, npm pack contents, Node import and smoke test",
			arguments: z.object({ pkg: PkgArg }),
			execute: async (args: { pkg: string }, context: Context) => {
				const r = await verify(context, "scripts/verify-package.ts", [args.pkg]);
				const data = PackageSchema.parse({
					label: context.globalArgs.label,
					pkg: args.pkg,
					checkedAt: new Date().toISOString(),
					...r,
					summary: r.ok ? `${r.files} files, Node import ok` : r.problems.join("; "),
				});
				if (!data.ok) context.logger.warning("Package check failed: {summary}", data);
				return { dataHandles: [await context.writeResource("package", "package", data)] };
			},
		},
		health: {
			description: "Run bun run fallow: no dead code, no duplication, no complexity beyond the baseline",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: Context) => {
				const gate = await run(context, ["run", "fallow"]);
				const report = await run(context, ["run", "--silent", "fallow", "--format", "json"]);
				const d = JSON.parse(report.stdout) as {
					check: { total_issues: number };
					dupes: { stats: { duplicated_lines: number } };
					health: {
						findings: unknown[];
						summary: { functions_above_threshold: number; average_maintainability: number };
					};
				};
				const ok = gate.code === 0;
				const data: z.infer<typeof HealthSchema> = {
					label: context.globalArgs.label,
					checkedAt: new Date().toISOString(),
					deadCode: d.check.total_issues,
					duplicatedLines: d.dupes.stats.duplicated_lines,
					newComplexity: d.health.findings.length,
					baselined: d.health.summary.functions_above_threshold - d.health.findings.length,
					maintainability: d.health.summary.average_maintainability,
					ok,
					summary: `dead code ${d.check.total_issues}; duplicated lines ${d.dupes.stats.duplicated_lines}; new complexity ${d.health.findings.length}; maintainability ${d.health.summary.average_maintainability}`,
					output: ok ? "" : tail(gate.stdout + gate.stderr),
				};
				if (!ok) context.logger.warning("Fallow failed: {summary}", data);
				return { dataHandles: [await context.writeResource("health", "health", data)] };
			},
		},
		release: {
			description: "Run scripts/verify-release.ts for one package: version, CHANGELOG section, tag and npm free, clean main",
			arguments: z.object({
				pkg: PkgArg,
				allowDirty: z.boolean().default(false).describe("Skip the clean-tree and on-main checks while preparing"),
			}),
			execute: async (args: { pkg: string; allowDirty: boolean }, context: Context) => {
				const r = await verify(context, "scripts/verify-release.ts", [
					args.pkg,
					...(args.allowDirty ? ["--allow-dirty"] : []),
				]);
				const data = ReleaseSchema.parse({
					label: context.globalArgs.label,
					pkg: args.pkg,
					checkedAt: new Date().toISOString(),
					...r,
					summary: r.ok ? `ready to release ${r.tag}` : r.problems.join("; "),
				});
				if (!data.ok) context.logger.warning("Release check failed: {summary}", data);
				return { dataHandles: [await context.writeResource("release", "release", data)] };
			},
		},
	},
};
