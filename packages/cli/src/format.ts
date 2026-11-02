/** barmark format: charts in standard form, printed, rewritten in place, or checked. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { printChart } from "barmark";
import { parseFlags } from "./args.js";
import { type Chart, readCharts } from "./inputs.js";
import { type Io, UsageError } from "./io.js";

type Flags = { write: boolean; check: boolean };

function refuseMisuse(flags: Flags, positionals: string[]): void {
	if (flags.write && flags.check)
		throw new UsageError("--write and --check can't be used together");
	if (flags.write && positionals.includes("-")) throw new UsageError("--write can't rewrite stdin");
}

/** Rewrite (--write) or list (--check) each chart printChart would change; how many it found. */
function rewriteAll(charts: Chart[], write: boolean, io: Io): number {
	let changed = 0;
	for (const { path, text } of charts) {
		const canonical = printChart(text);
		if (canonical === text) continue;
		changed++;
		if (write) writeFileSync(resolve(io.cwd, path), canonical);
		io.stdout(`${write ? "formatted" : "would format"} ${path}\n`);
	}
	return changed;
}

export async function format(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		write: { type: "boolean", default: false },
		check: { type: "boolean", default: false },
	});
	refuseMisuse(values, positionals);
	const many = values.write || values.check;
	const charts = await readCharts(positionals, io, { folders: many });
	if (many) return rewriteAll(charts, values.write, io) && values.check ? 1 : 0;
	if (charts.length > 1) throw new UsageError("several charts need --write or --check");
	io.stdout(printChart(charts[0]?.text ?? ""));
	return 0;
}
