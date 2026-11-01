import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";

export const site = join(import.meta.dir, "..");
export const out = join(site, ".vercel/output/static");

let done = false;
/** Builds the site once per test run, however many files ask. */
export function build(): void {
	if (done) return;
	const run = Bun.spawnSync(["bun", "run", "build"], { cwd: site, stdout: "pipe", stderr: "pipe" });
	if (run.exitCode !== 0) throw new Error(run.stderr.toString().slice(-2000));
	done = true;
}

/** A prerendered page's document, e.g. page("index.html"). */
export function page(path: string): Document {
	build();
	return parseHTML(readFileSync(join(out, path), "utf8")).document;
}
