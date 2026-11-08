/**
 * Serves the score suite's pages: `<barmark-score>` elements loading the
 * built packages through an import map, and a server-drawn score.
 *
 *   bun packages/score/browser/server.ts   (PORT, default 5261)
 */
import { join } from "node:path";
import { fontFaceCss } from "@barmark/render";
import { renderScoreHtml } from "../src/server.js";

const root = join(import.meta.dir, "../../..");

/** Sixteen bars: enough systems that a narrower page needs more of them. */
const CHART = `# Sixteen Bars
key: G, time: 4/4

## Verse
| G | Em | C | D7 |
| G | Em | Am7 | D7 |
## Chorus
| C | D | Bm7 | Em |
| Am7 | D7 | G | G |
`;

/*
 * A document's import map does not reach a module worker, and worker.js
 * imports bare specifiers (verovio/*, barmark, @barmark/musicxml). So
 * /score/worker.js is served as one bundle with all of them inlined (Verovio
 * embeds its wasm, so there is no .wasm to serve), built once here; the page
 * itself loads dist/ through the import map, as render's suite does.
 */
const built = await Bun.build({
	entrypoints: [join(root, "packages/score/dist/worker.js")],
	target: "browser",
	format: "esm",
});
const [workerBundle] = built.outputs;
if (!built.success || !workerBundle)
	throw new Error(`worker bundle failed: ${built.logs.join("\n")}`);
const worker = await workerBundle.text();

const IMPORTS = {
	barmark: "/barmark/index.js",
	"@barmark/render": "/render/index.js",
	"@barmark/render/element": "/render/element.js",
};
const ELEMENT = `<script type="importmap">${JSON.stringify({ imports: IMPORTS })}</script>
<script type="module" src="/score/element.js"></script>`;

const html = (head: string, body: string) =>
	new Response(
		`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:1em}barmark-score{display:block}</style>${head}</head><body>${body}</body></html>`,
		{ headers: { "content-type": "text/html; charset=utf-8" } },
	);

const escapeAttr = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

/** `count` elements (default 1), each with `theme` and `verovio-url` when given. */
function scorePage(url: URL): Response {
	const p = url.searchParams;
	const attrs = ["theme", "verovio-url"]
		.filter((name) => p.has(name))
		.map((name) => ` ${name}="${escapeAttr(p.get(name) ?? "")}"`)
		.join("");
	const one = (i: number) =>
		`<barmark-score id="s${i}"${attrs}><script type="text/barmark">${CHART}</script></barmark-score>`;
	const count = Number(p.get("count") ?? "1");
	return html(ELEMENT, Array.from({ length: count }, (_, i) => one(i)).join(""));
}

/** A server-drawn score; with `element`, the element's script loads and takes it over. */
const serverPage = (url: URL) =>
	html(
		`<style>${fontFaceCss("/render/fonts/Edwin-Roman.otf")}</style>${url.searchParams.has("element") ? ELEMENT : ""}`,
		renderScoreHtml(CHART, { theme: "dark" }),
	);

const STATIC: [string, string][] = [
	["/score/", "packages/score/dist/"],
	// element.js finds Edwin at ../../render/fonts/ from itself, as under node_modules/@barmark/.
	["/render/fonts/", "packages/render/fonts/"],
	["/render/", "packages/render/dist/"],
	["/barmark/", "packages/barmark/dist/"],
];

/** A file under the first STATIC directory whose prefix matches and that has it, or a 404. */
async function staticFile(req: Request): Promise<Response> {
	const { pathname } = new URL(req.url);
	for (const [prefix, dir] of STATIC) {
		if (!pathname.startsWith(prefix)) continue;
		const file = Bun.file(join(root, dir, pathname.slice(prefix.length)));
		if (await file.exists()) return new Response(file);
	}
	return new Response("not found", { status: 404 });
}

const server = Bun.serve({
	port: Number(process.env.PORT ?? 5261),
	routes: {
		"/score": (req) => scorePage(new URL(req.url)),
		"/server": (req) => serverPage(new URL(req.url)),
		"/score/worker.js": new Response(worker, {
			headers: { "content-type": "text/javascript; charset=utf-8" },
		}),
	},
	fetch: staticFile,
});
console.log(`score suite pages on ${server.url}`);
