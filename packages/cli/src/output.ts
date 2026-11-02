/** Where a command's result goes: stdout, or the file named by --out. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
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

/** The one chart a single-chart command reads. */
export function onlyChart<T>(charts: T[], command: string): T {
	const [chart, ...rest] = charts;
	if (!chart || rest.length) throw new UsageError(`${command} takes one chart`);
	return chart;
}
