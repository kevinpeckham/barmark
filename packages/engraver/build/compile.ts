/**
 * `bun run compile`: the emcc build. Runs build.sh into dist/ (from the
 * package's root), streaming its output, then prints each compiled file's
 * name, size and SRI digest (sha384).
 */
import { createHash } from "node:crypto";
import { join } from "node:path";

const PKG = join(import.meta.dir, "..");
const FILES = ["verovio-module.mjs", "verovio-module.wasm"];

const build = Bun.spawnSync(["bash", "build/build.sh", "dist"], {
	cwd: PKG,
	stdio: ["inherit", "inherit", "inherit"],
});
if (build.exitCode !== 0) {
	console.error(`compile: build.sh exited with ${build.exitCode}`);
	process.exit(build.exitCode ?? 1);
}
for (const name of FILES) {
	const bytes = new Uint8Array(await Bun.file(join(PKG, "dist", name)).arrayBuffer());
	const digest = createHash("sha384").update(bytes).digest("base64");
	console.log(`${name}  ${bytes.length} bytes  sha384-${digest}`);
}
