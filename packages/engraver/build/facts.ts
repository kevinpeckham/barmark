/**
 * The build's facts: the sizes and SRI digests (sha384) of the compiled
 * module and wasm, the committed `src/info.ts` that anchors them, and the
 * check of a `dist/` against it. Shared by `bun run compile` and
 * `bun run build` (`dist.ts`).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The compiled files' sizes and sha384 digests, as an SRI string. */
export type Facts = {
	moduleBytes: number;
	wasmBytes: number;
	moduleIntegrity: string;
	wasmIntegrity: string;
};

/** The facts as `src/info.ts` exports them. */
export type Info = {
	MODULE_BYTES: number;
	WASM_BYTES: number;
	MODULE_INTEGRITY: string;
	WASM_INTEGRITY: string;
};

const KEYS = [
	"VEROVIO_TAG",
	"VEROVIO_COMMIT",
	"EMSDK_VERSION",
	"EMSDK_COMMIT",
	"CMAKE_VERSION",
	"OPT",
	"MODIFIED",
] as const;

/** `build/versions.env`: the pinned inputs. */
export type Versions = Record<(typeof KEYS)[number], string>;

const MODULE_FILE = "verovio-module.mjs";
const WASM_FILE = "verovio-module.wasm";

const integrity = (bytes: Uint8Array) =>
	`sha384-${createHash("sha384").update(bytes).digest("base64")}`;

export function factsOf(module: Uint8Array, wasm: Uint8Array): Facts {
	return {
		moduleBytes: module.length,
		wasmBytes: wasm.length,
		moduleIntegrity: integrity(module),
		wasmIntegrity: integrity(wasm),
	};
}

/** Reads versions.env as build.sh sources it (KEY=value lines); throws naming a missing key. */
export function readVersions(text: string): Versions {
	const pairs = new Map<string, string>();
	for (const line of text.split("\n")) {
		const eq = line.indexOf("=");
		if (eq > 0 && !line.startsWith("#"))
			pairs.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
	}
	const versions: Partial<Versions> = {};
	for (const key of KEYS) {
		const value = pairs.get(key);
		if (value === undefined) throw new Error(`versions.env has no ${key}`);
		versions[key] = value;
	}
	return versions as Versions;
}

// One constant, wrapped onto a second line as Biome does when it passes 100 columns.
function constant(name: string, value: string | number): string {
	const literal = JSON.stringify(value);
	const line = `export const ${name} = ${literal};`;
	return line.length <= 100 ? line : `export const ${name} =\n\t${literal};`;
}

/** The whole `src/info.ts` source, already formatted as Biome formats it. */
export function renderInfo(facts: Facts, versions: Versions, packageVersion: string): string {
	const cdn = `https://cdn.jsdelivr.net/npm/@barmark/engraver@${packageVersion}/dist/${MODULE_FILE}`;
	return [
		"// Written by `bun run compile --update` (build/facts.ts): do not edit by hand.",
		"// The sizes and SRI digests (sha384) every build of dist/ must match byte for byte.",
		"",
		constant("VEROVIO_VERSION", versions.VEROVIO_TAG.replace(/^version-/, "")),
		constant("VEROVIO_COMMIT", versions.VEROVIO_COMMIT),
		constant("MODULE_BYTES", facts.moduleBytes),
		constant("WASM_BYTES", facts.wasmBytes),
		constant("MODULE_INTEGRITY", facts.moduleIntegrity),
		constant("WASM_INTEGRITY", facts.wasmIntegrity),
		constant("WASM_FILE", WASM_FILE),
		constant("CDN_URL", cdn),
		"",
	].join("\n");
}

/** One line per compiled file whose size or digest differs from info.ts. */
export function infoProblems(facts: Facts, info: Info): string[] {
	const files = [
		[
			MODULE_FILE,
			facts.moduleBytes,
			facts.moduleIntegrity,
			info.MODULE_BYTES,
			info.MODULE_INTEGRITY,
		],
		[WASM_FILE, facts.wasmBytes, facts.wasmIntegrity, info.WASM_BYTES, info.WASM_INTEGRITY],
	] as const;
	return files
		.filter(([, n, digest, m, digest2]) => n !== m || digest !== digest2)
		.map(
			([file, n, digest, m, digest2]) =>
				`${file}: ${n} bytes, ${digest}, but info.ts says ${m} bytes, ${digest2}. If the build changed on purpose, run \`bun run compile --update\` and commit info.ts; otherwise run \`bun run compile\` for a clean build.`,
		);
}

const HOW =
	"run `bun run compile`, or download CI's engraver-dist artifact into packages/engraver/dist";
const NO_MODULE = `dist/ has no compiled module: ${HOW}`;

/** The facts of the compiled files in `dir`. */
export function readFacts(dir: string): Facts {
	return factsOf(readFileSync(join(dir, MODULE_FILE)), readFileSync(join(dir, WASM_FILE)));
}

/**
 * What `bun run build` says of `dir`: compiled files present must match
 * info.ts; with `requireModule` (prepack) they must also be present.
 */
export function checkDist(
	dir: string,
	info: Info,
	requireModule: boolean,
): { problems: string[]; notes: string[] } {
	const missing = [MODULE_FILE, WASM_FILE].filter((file) => !existsSync(join(dir, file)));
	if (missing.length === 2)
		return requireModule
			? { problems: [NO_MODULE], notes: [] }
			: { problems: [], notes: [NO_MODULE] };
	if (missing.length === 1)
		return { problems: [`dist/${missing[0]} is missing: ${HOW}`], notes: [] };
	const problems = infoProblems(readFacts(dir), info);
	return { problems, notes: problems.length ? [] : ["dist/ matches info.ts"] };
}
