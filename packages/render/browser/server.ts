/**
 * Serves the browser suite's pages: charts rendered by renderChart on a
 * plain page and on a hostile one, and the <barmark-chart> element loading
 * the built packages through an import map.
 *
 *   bun packages/render/browser/server.ts   (PORT, default 5260)
 */
import { join } from "node:path";
import { fontFaceCss, type RenderOptions, renderChart } from "../src/index.js";
import { EXAMPLE } from "../tests/fixtures.js";

const root = join(import.meta.dir, "../../..");
const CHARTS: Record<string, string> = {
	example: EXAMPLE,
	busy: "# Busy\n## A\n| Am7(b5)/G D7(b9)/F# Gm7/F C7(b9)/E |\n| {Db1 F1 Ab1 C2 Eb2} {Db1 F1 Ab1 C2 Eb2} |\n| D_E_F#m_G_A_B_C D_E_F#m_G_A_B_C |\n| F#m7(b5)/E F#m7(b5)/E F#m7(b5)/E F#m7(b5)/E |",
	long: "# Long\n## A\n| A | B | C | D | E | F | G | A | B | C | D | E |\n| A / B / | C / D / | E / F / | G / A / | B / C / | D / E / |",
};
const HOSTILE = `*{margin:2em!important;padding:0!important;font-family:"Comic Sans MS",cursive!important;line-height:3!important}
sup{vertical-align:top}div{color:red}
body{background:#000;color:#0f0;letter-spacing:.2em;word-spacing:1em;font-style:italic;font-weight:700;text-transform:uppercase;text-indent:3em;text-shadow:0 0 2px red}`;

const page = (head: string, body: string) =>
	new Response(
		`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${fontFaceCss("/fonts/Edwin-Roman.otf")}</style>${head}</head><body>${body}</body></html>`,
		{ headers: { "content-type": "text/html; charset=utf-8" } },
	);

/** The page's own CSS: the hostile rules, or plain margins plus any `css` parameter. */
const pageStyle = (p: URLSearchParams, hostile: boolean) =>
	hostile ? HOSTILE : `body{margin:2em}barmark-chart{margin:2em}${p.get("css") ?? ""}`;

/**
 * With a width, the plain page puts the chart exactly where the hostile
 * page's margins (2em on html, body, the wrapper and the chart) put it, so
 * their screenshots can be compared pixel for pixel.
 */
function placed(charts: string, width: number, hostile: boolean): { css: string; body: string } {
	if (!width) return { css: "", body: charts };
	if (hostile) return { css: "", body: `<div style="width:${width}px">${charts}</div>` };
	return {
		css: "barmark-chart{margin:0}",
		body: `<div style="position:absolute;left:128px;top:64px;width:${width - 64}px">${charts}</div>`,
	};
}

const param = (p: URLSearchParams, name: string, fallback: string) => p.get(name) ?? fallback;

function chartPage(url: URL, hostile: boolean): Response {
	const p = url.searchParams;
	const options: RenderOptions = {
		theme: param(p, "theme", "auto") as NonNullable<RenderOptions["theme"]>,
		rehearsalLetters: p.has("letters"),
	};
	const chart = CHARTS[param(p, "chart", "example")] ?? "";
	const charts = renderChart(chart, options).repeat(Number(param(p, "count", "1")));
	const { css, body } = placed(charts, Number(param(p, "width", "0")), hostile);
	return page(`<style>${pageStyle(p, hostile)}${css}</style>`, body);
}

const ELEMENT = `<script type="importmap">{"imports":{"barmark":"/barmark/index.js"}}</script>
<script type="module" src="/render/element.js"></script>`;

function elementPage(): Response {
	return page(
		ELEMENT,
		`<barmark-chart id="inline"><script type="text/barmark">
			## Verse
			| D | A |
		</script></barmark-chart>
		<barmark-chart id="remote" src="/example.chart.md" rehearsal-letters></barmark-chart>
		<barmark-chart id="missing" src="/nope.chart.md"></barmark-chart>
		${renderChart("## Verse\n| D | A |").replace("<barmark-chart>", '<barmark-chart id="server">')}`,
	);
}

const STATIC: [string, string][] = [
	["/render/", "packages/render/dist/"],
	["/barmark/", "packages/barmark/dist/"],
	["/fonts/", "packages/render/fonts/"],
];

const ROUTES: Record<string, (url: URL) => Response> = {
	"/chart": (url) => chartPage(url, false),
	"/hostile": (url) => chartPage(url, true),
	"/element": () => elementPage(),
	"/example.chart.md": () => new Response(EXAMPLE),
};

const notFound = () => new Response("not found", { status: 404 });

async function staticFile(pathname: string): Promise<Response> {
	const match = STATIC.find(([prefix]) => pathname.startsWith(prefix));
	if (!match) return notFound();
	const file = Bun.file(join(root, match[1], pathname.slice(match[0].length)));
	return (await file.exists()) ? new Response(file) : notFound();
}

const server = Bun.serve({
	port: Number(process.env.PORT ?? 5260),
	fetch(req) {
		const url = new URL(req.url);
		return ROUTES[url.pathname]?.(url) ?? staticFile(url.pathname);
	},
});
console.log(`browser suite pages on ${server.url}`);
