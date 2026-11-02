/** barmark render: a chart as a standalone HTML page, with Edwin embedded unless linked. */
import { basename } from "node:path";
import { type RenderOptions, renderChart } from "@barmark/render";
import { parseChart } from "barmark";
import { oneOf, parseFlags } from "./args.js";
import { readCharts } from "./inputs.js";
import type { Io } from "./io.js";
import { onlyChart, writeOutput } from "./output.js";

const THEMES = ["auto", "light", "dark"] as const;
const NUMERALS = ["nashville", "roman"] as const;

const escapeHtml = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function htmlDocument(title: string, body: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

export async function render(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		out: { type: "string" },
		theme: { type: "string", default: "auto" },
		numerals: { type: "string" },
		"no-bar-numbers": { type: "boolean", default: false },
		"rehearsal-letters": { type: "boolean", default: false },
		"no-wrap": { type: "boolean", default: false },
		diagnostics: { type: "boolean", default: false },
		"font-url": { type: "string" },
	});
	const options: RenderOptions = {
		fontUrl:
			values["font-url"] ?? `data:font/otf;base64,${Buffer.from(io.font()).toString("base64")}`,
	};
	const theme = oneOf("theme", values.theme, THEMES);
	if (theme !== "auto") options.theme = theme;
	if (values.numerals !== undefined)
		options.numerals = oneOf("numerals", values.numerals, NUMERALS);
	if (values["no-bar-numbers"]) options.barNumbers = false;
	if (values["rehearsal-letters"]) options.rehearsalLetters = true;
	if (values["no-wrap"]) options.wrap = false;
	if (values.diagnostics) options.diagnostics = true;

	const { path, text } = onlyChart(await readCharts(positionals, io, { folders: false }), "render");
	const title = parseChart(text).title ?? basename(path).replace(/\.chart\.md$|\.md$/, "");
	writeOutput(htmlDocument(title, renderChart(text, options)), values.out, io);
	return 0;
}
