/**
 * barmark render: a chart as a standalone HTML page: the bar grid, with Edwin
 * embedded unless linked, or with --score the full engraved score.
 */
import { basename } from "node:path";
import { type RenderOptions, renderChart } from "@barmark/render";
import { extractPart, parseChart } from "barmark";
import { oneOf, parseFlags } from "./args.js";
import { readCharts } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { onlyChart, writeOutput } from "./output.js";
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH, scoreBody } from "./score.js";

const THEMES = ["auto", "light", "dark"] as const;
const NUMERALS = ["nashville", "roman"] as const;
const COLUMNS = ["shared", "row"] as const;

const escapeHtml = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function htmlDocument(title: string, body: string): string {
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

const FLAGS = {
	out: { type: "string" },
	theme: { type: "string", default: "auto" },
	numerals: { type: "string" },
	"no-bar-numbers": { type: "boolean", default: false },
	"rehearsal-letters": { type: "boolean", default: false },
	"no-wrap": { type: "boolean", default: false },
	columns: { type: "string" },
	diagnostics: { type: "boolean", default: false },
	"font-url": { type: "string" },
	part: { type: "string" },
	score: { type: "boolean", default: false },
	width: { type: "string" },
} as const;

type Values = ReturnType<typeof parseFlags<typeof FLAGS>>["values"];

/** The grid's own flags: a score has no numerals, bar-number switch, letters, rows, columns, problem list or Edwin. */
const GRID_ONLY = [
	"numerals",
	"no-bar-numbers",
	"rehearsal-letters",
	"no-wrap",
	"columns",
	"diagnostics",
	"font-url",
] as const;

/** The engraving width --width gives, refusing what Verovio cannot lay out. */
function widthOf(value: string | undefined): number {
	if (value === undefined) return DEFAULT_WIDTH;
	const width = /^\d+$/.test(value) ? Number(value) : Number.NaN;
	if (!(width >= MIN_WIDTH && width <= MAX_WIDTH))
		throw new UsageError(
			`--width must be a whole number of pixels from ${MIN_WIDTH} to ${MAX_WIDTH}, not "${value}"`,
		);
	return width;
}

/** The flags as `renderChart`'s options. */
function gridOptions(values: Values, theme: (typeof THEMES)[number], io: Io): RenderOptions {
	if (values.width !== undefined) throw new UsageError("--width needs --score");
	const options: RenderOptions = {
		fontUrl:
			values["font-url"] ?? `data:font/otf;base64,${Buffer.from(io.font()).toString("base64")}`,
	};
	if (theme !== "auto") options.theme = theme;
	if (values.numerals !== undefined)
		options.numerals = oneOf("numerals", values.numerals, NUMERALS);
	if (values["no-bar-numbers"]) options.barNumbers = false;
	if (values["rehearsal-letters"]) options.rehearsalLetters = true;
	if (values["no-wrap"]) options.wrap = false;
	if (values.diagnostics) options.diagnostics = true;
	return Object.assign(options, columnsOption(values.columns));
}

/** `--columns row` as the option; `shared`, the default, as none, so the page is the default's. */
function columnsOption(value: string | undefined): Pick<RenderOptions, "columns"> {
	if (value === undefined) return {};
	return oneOf("columns", value, COLUMNS) === "row" ? { columns: "row" } : {};
}

/** --score's width, refusing the grid's own flags. */
function scoreWidth(values: Values): number {
	const given = GRID_ONLY.find((flag) => values[flag] !== undefined && values[flag] !== false);
	if (given) throw new UsageError(`--${given} does not apply to --score`);
	return widthOf(values.width);
}

export async function render(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, FLAGS);
	const theme = oneOf("theme", values.theme, THEMES);
	const options = values.score ? null : gridOptions(values, theme, io);
	const width = values.score ? scoreWidth(values) : 0;

	const { path, text } = onlyChart(await readCharts(positionals, io, { folders: false }), "render");
	if (values.part !== undefined && !extractPart(text, values.part)) {
		io.stderr(`${path}: no part labelled ${values.part}\n`);
		return 1;
	}
	const title = parseChart(text).title ?? basename(path).replace(/\.chart\.md$|\.md$/, "");
	if (options) {
		if (values.part !== undefined) options.part = values.part;
		writeOutput(htmlDocument(title, renderChart(text, options)), values.out, io);
		return 0;
	}
	const score = await scoreBody(
		text,
		{
			theme,
			width,
			label: title,
			...(values.part === undefined ? {} : { part: values.part }),
		},
		io,
	);
	if (!score.ok) {
		io.stderr(`${path}: ${score.reason}\n`);
		return 1;
	}
	writeOutput(htmlDocument(title, score.html), values.out, io);
	return 0;
}
