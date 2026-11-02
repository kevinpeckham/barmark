/** barmark format: charts in standard form, printed, rewritten in place, or checked. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { printChart } from "barmark";
import { parseFlags } from "./args.js";
import { readCharts } from "./inputs.js";
import { type Io, UsageError } from "./io.js";

export async function format(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		write: { type: "boolean", default: false },
		check: { type: "boolean", default: false },
	});
	if (values.write && values.check)
		throw new UsageError("--write and --check can't be used together");
	if (values.write && positionals.includes("-"))
		throw new UsageError("--write can't rewrite stdin");
	const many = values.write || values.check;
	const charts = await readCharts(positionals, io, { folders: many });
	if (!many) {
		if (charts.length > 1) throw new UsageError("several charts need --write or --check");
		io.stdout(printChart(charts[0]?.text ?? ""));
		return 0;
	}
	let changed = 0;
	for (const { path, text } of charts) {
		const canonical = printChart(text);
		if (canonical === text) continue;
		changed++;
		if (values.write) {
			writeFileSync(resolve(io.cwd, path), canonical);
			io.stdout(`formatted ${path}\n`);
		} else io.stdout(`would format ${path}\n`);
	}
	return values.check && changed ? 1 : 0;
}
