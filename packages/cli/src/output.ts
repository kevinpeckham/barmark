/** Where a command's result goes: stdout, or the file named by --out. */
import { renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { type Io, UsageError } from "./io.js";

export function writeOutput(text: string, out: string | undefined, io: Io): void {
	if (out === undefined) {
		io.stdout(text);
		return;
	}
	try {
		writeFileSync(resolve(io.cwd, out), text);
	} catch {
		throw new UsageError(`cannot write ${out}`);
	}
}

/**
 * Replaces a file whole: the text goes to a temporary file beside it, with
 * its permissions, which then takes its name. A failure part-way leaves the
 * old file as it was, never half-written.
 */
export function replaceFile(path: string, text: string, io: Io): void {
	const target = resolve(io.cwd, path);
	const temp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
	try {
		writeFileSync(temp, text, { mode: statSync(target).mode & 0o777 });
		renameSync(temp, target);
	} catch {
		rmSync(temp, { force: true });
		throw new UsageError(`cannot write ${path}`);
	}
}

/** The one chart a single-chart command reads. */
export function onlyChart<T>(charts: T[], command: string): T {
	const [chart, ...rest] = charts;
	if (!chart || rest.length) throw new UsageError(`${command} takes one chart`);
	return chart;
}
