/**
 * What `npm pack` must publish for each package: `scripts/verify-package.ts`
 * checks the packed tarball against it, and the packages' tests hold it to
 * their `package.json` `files`.
 */
import type { PackageKey } from "./lib.js";

/** What every package publishes. */
export const COMMON = ["package.json", "README.md", "CHANGELOG.md"];

/** What each package must publish, beyond package.json, the README and CHANGELOG. */
export const CONTENTS: Record<PackageKey, { required: string[]; allowed: RegExp }> = {
	barmark: {
		required: ["LICENSE", "dist/index.js", "dist/index.d.ts"],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts))$/,
	},
	render: {
		required: [
			"LICENSE",
			"dist/index.js",
			"dist/index.d.ts",
			"dist/element.js",
			"fonts/Edwin-Roman.otf",
			"fonts/OFL.txt",
			"fonts/README.md",
		],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts)|fonts\/(Edwin-Roman\.otf|OFL\.txt|README\.md))$/,
	},
	musicxml: {
		required: ["LICENSE", "dist/index.js", "dist/index.d.ts"],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts))$/,
	},
	score: {
		required: [
			"LICENSE",
			"dist/index.js",
			"dist/index.d.ts",
			"dist/element.js",
			"dist/server.js",
			"dist/worker.js",
		],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts))$/,
	},
	sync: {
		required: [
			"LICENSE",
			"dist/index.js",
			"dist/index.d.ts",
			"dist/timing/index.js",
			"dist/timing/index.d.ts",
		],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts))$/,
	},
	midi: {
		required: [
			"LICENSE",
			"dist/index.js",
			"dist/index.d.ts",
			"dist/perform/index.js",
			"dist/perform/index.d.ts",
		],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts))$/,
	},
	listen: {
		required: [
			"LICENSE",
			"dist/index.js",
			"dist/index.d.ts",
			"dist/features/index.js",
			"dist/features/index.d.ts",
			"dist/stages.js",
			"dist/stages.d.ts",
		],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts))$/,
	},
	fretboard: {
		required: ["LICENSE", "dist/index.js", "dist/index.d.ts"],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts))$/,
	},
	cli: {
		required: ["LICENSE", "dist/cli.js", "dist/main.js"],
		allowed: /^(LICENSE|dist\/.+\.(js|d\.ts))$/,
	},
	engraver: {
		required: [
			"dist/verovio-module.mjs",
			"dist/verovio-module.wasm",
			"dist/index.d.mts",
			"dist/info.js",
			"dist/info.d.ts",
			"build/versions.env",
			"build/data.txt",
			"build/build.sh",
			"build/source.sh",
			"COPYING",
			"COPYING.LESSER",
			"OFL.txt",
			"THIRD-PARTY.md",
			"NOTICE.md",
		],
		allowed:
			/^(COPYING|COPYING\.LESSER|OFL\.txt|THIRD-PARTY\.md|NOTICE\.md|dist\/(verovio-module\.(mjs|wasm)|index\.d\.mts|info\.(js|d\.ts))|build\/[^/]+)$/,
	},
};
