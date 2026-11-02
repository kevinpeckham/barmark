/**
 * Compile the standalone barmark binary for one platform.
 *
 *   bun scripts/compile.ts <target> <outfile>
 *
 * <target> is linux-x64, linux-arm64, darwin-x64, darwin-arm64 or windows-x64.
 */
const TARGETS = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "windows-x64"];
const [target = "", outfile = ""] = process.argv.slice(2);
if (!TARGETS.includes(target) || !outfile) {
	console.error(`usage: bun scripts/compile.ts <${TARGETS.join("|")}> <outfile>`);
	process.exit(2);
}
const build = Bun.spawnSync(
	[
		"bun",
		"build",
		"src/binary.ts",
		"--compile",
		"--minify",
		`--target=bun-${target}`,
		"--outfile",
		outfile,
	],
	{ cwd: `${import.meta.dir}/..`, stdout: "inherit", stderr: "inherit" },
);
process.exit(build.exitCode ?? 1);
