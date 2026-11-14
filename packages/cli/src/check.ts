/** barmark check: each chart's errors and warnings, as text, GitHub annotations or JSON. */
import { parseChart } from "barmark";
import { oneOf, parseFlags } from "./args.js";
import { readCharts } from "./inputs.js";
import type { Io } from "./io.js";
import { githubLine, summary, textLine } from "./report.js";

const FORMATS = ["text", "github", "json"] as const;

export async function check(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		strict: { type: "boolean", default: false },
		format: { type: "string", default: "text" },
	});
	const format = oneOf("format", values.format, FORMATS);
	const results = (await readCharts(positionals, io, { folders: true })).map(({ path, text }) => ({
		path,
		diagnostics: parseChart(text).diagnostics,
	}));
	const all = results.flatMap((r) => r.diagnostics);
	const errors = all.filter((d) => d.severity === "error").length;
	const warnings = all.length - errors;

	if (format === "json") {
		const files = results.map(({ path, diagnostics }) => ({
			file: path,
			diagnostics: diagnostics.map(({ line, severity, message, suggestion }) => ({
				line,
				severity,
				message,
				...(suggestion ? { suggestion } : {}),
			})),
		}));
		io.stdout(`${JSON.stringify(files, null, 2)}\n`);
	} else {
		const line = format === "github" ? githubLine : textLine;
		for (const { path, diagnostics } of results)
			for (const d of diagnostics) io.stdout(`${line(path, d)}\n`);
		if (format === "text") io.stdout(`${summary(results.length, errors, warnings)}\n`);
	}
	return errors || (values.strict && warnings) ? 1 : 0;
}
