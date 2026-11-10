/**
 * Serves the score suite's pages: `<barmark-score>` elements loading the
 * built packages through an import map, and a server-drawn score.
 *
 *   bun packages/score/browser/server.ts   (PORT, default 5261)
 *
 * It needs @barmark/engraver's compiled module in packages/engraver/dist
 * (`bun run compile` there, or CI's engraver-dist artifact).
 */
import { join } from "node:path";
import { fontFaceCss } from "@barmark/render";
import { renderScoreHtml } from "../src/server.js";
import { viewOf } from "../src/switch.js";
import {
	ENGRAVER_CDN_INTEGRITY,
	ENGRAVER_WASM_INTEGRITY,
	VEROVIO_CDN_INTEGRITY,
} from "../src/verovio.js";

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

/** Charts the pages draw, by name: `sharps` has accidentals and a tempo mark, Leipzig's glyphs. */
const CHARTS: Record<string, string> = {
	sharps: "# Sharps\ntempo: 120\n| C#m7 | Bb | F#7 | Ebmaj7 |\n",
};

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

/*
 * The failure cases' verovio-url, by name: the page never takes a module URL
 * from the query, since the worker would import whatever it named.
 */
const ENGINES: Record<string, string> = {
	missing: "/nope/verovio.mjs",
	data: "data:text/javascript,export default async () => ({})",
	// The installed Verovio module, as served (Content-Length, no encoding) and gzipped.
	local: "/verovio/verovio-module.mjs",
	gzip: "/verovio-gz/verovio-module.mjs",
	// Gzipped from another origin (localhost, not 127.0.0.1), with CORS but Content-Encoding not exposed.
	"gzip-cross": `http://localhost:${process.env.PORT ?? 5261}/verovio-gz-cors/verovio-module.mjs`,
};

/** The verovio-integrity values, by name: the module's own digest, and another. */
const DIGESTS: Record<string, string> = {
	good: VEROVIO_CDN_INTEGRITY,
	bad: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};
/*
 * The lite build (@barmark/engraver), by name: its verovio-url, with both
 * digests, except `nowasmintegrity`, which sets only the module's. `badwasm`
 * serves a .wasm with its last byte flipped; `nowasm` serves none.
 */
const LITE: Record<string, { url: string; wasmIntegrity?: string }> = {
	ok: { url: "/engraver/ok/verovio-module.mjs", wasmIntegrity: ENGRAVER_WASM_INTEGRITY },
	badwasm: { url: "/engraver/badwasm/verovio-module.mjs", wasmIntegrity: ENGRAVER_WASM_INTEGRITY },
	nowasm: { url: "/engraver/nowasm/verovio-module.mjs", wasmIntegrity: ENGRAVER_WASM_INTEGRITY },
	nowasmintegrity: { url: "/engraver/ok/verovio-module.mjs" },
};
const PRELOADS = new Set(["none", "intent", "idle"]);
const MAX_COUNT = 4;
/** The verovio-wasm-integrity values, by name: the lite build's, for an `engine` that never asks for a .wasm. */
const WASM_DIGESTS: Record<string, string> = { lite: ENGRAVER_WASM_INTEGRITY };
const ALLOWED = new Set([
	"theme",
	"engine",
	"count",
	"chart",
	"integrity",
	"preload",
	"lite",
	"wasmintegrity",
]);

const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_COUNT;
const named = (table: Record<string, unknown>, name: string | null) =>
	name === null || Object.hasOwn(table, name);

/** Each check on the query, with what it says when the query fails it. */
const CHECKS: [(p: URLSearchParams) => boolean, (p: URLSearchParams) => string][] = [
	(() => {
		const unknown = (p: URLSearchParams) => [...p.keys()].find((k) => !ALLOWED.has(k));
		return [(p) => !unknown(p), (p) => `unknown parameter: ${unknown(p)}`];
	})(),
	[(p) => named(ENGINES, p.get("engine")), (p) => `unknown engine: ${p.get("engine")}`],
	[(p) => named(CHARTS, p.get("chart")), (p) => `unknown chart: ${p.get("chart")}`],
	[(p) => named(DIGESTS, p.get("integrity")), (p) => `unknown integrity: ${p.get("integrity")}`],
	[(p) => named(LITE, p.get("lite")), (p) => `unknown lite: ${p.get("lite")}`],
	[
		(p) => named(WASM_DIGESTS, p.get("wasmintegrity")),
		(p) => `unknown wasmintegrity: ${p.get("wasmintegrity")}`,
	],
	[(p) => !(p.has("lite") && p.has("wasmintegrity")), () => "lite sets its own wasm digest"],
	[(p) => !(p.has("lite") && p.has("engine")), () => "lite and engine are both a verovio-url"],
	[(p) => !p.has("preload") || PRELOADS.has(p.get("preload") ?? ""), () => "unknown preload"],
	[(p) => inRange(Number(p.get("count") ?? "1")), () => `count must be 1 to ${MAX_COUNT}`],
];

/** Why the query is refused, or null: only known parameters, a named engine and chart, a small count. */
function refusal(p: URLSearchParams): string | null {
	const failed = CHECKS.find(([ok]) => !ok(p));
	return failed ? failed[1](p) : null;
}

const attr = (name: string, value: string | null | undefined) =>
	value == null ? "" : ` ${name}="${escapeAttr(value)}"`;

/** The named lite copy's three attributes: its URL, its module digest and, if it has one, its wasm digest. */
function liteAttrs(name: string): string {
	const copy = LITE[name];
	if (!copy) return "";
	return (
		attr("verovio-url", copy.url) +
		attr("verovio-integrity", ENGRAVER_CDN_INTEGRITY) +
		attr("verovio-wasm-integrity", copy.wasmIntegrity)
	);
}

/** The element's attributes: `theme` and `preload` as given, the named engine's verovio-url and the named digest, or a lite copy's. */
const attrsOf = (p: URLSearchParams) => {
	const q = (key: string) => p.get(key) ?? "";
	return (
		attr("theme", p.get("theme")) +
		attr("preload", p.get("preload")) +
		attr("verovio-url", ENGINES[q("engine")]) +
		attr("verovio-integrity", DIGESTS[q("integrity")]) +
		attr("verovio-wasm-integrity", WASM_DIGESTS[q("wasmintegrity")]) +
		liteAttrs(q("lite"))
	);
};

/** The chart `chart` names, or the sixteen bars. */
const chartOf = (p: URLSearchParams) => CHARTS[p.get("chart") ?? ""] ?? CHART;

/** The i-th `<barmark-score>` of a page, with these attributes and chart. */
const scoreElement = (attrs: string, chart: string) => (i: number) =>
	`<barmark-score id="s${i}"${attrs}><script type="text/barmark">${chart}</script></barmark-score>`;

/** `count` elements (1 to MAX_COUNT, default 1), each with `theme` and the named `engine`'s verovio-url when given. */
function scorePage(url: URL): Response {
	const p = url.searchParams;
	const why = refusal(p);
	if (why) return new Response(why, { status: 400 });
	const one = scoreElement(attrsOf(p), chartOf(p));
	const count = Number(p.get("count") ?? "1");
	return html(ELEMENT, Array.from({ length: count }, (_, i) => one(i)).join(""));
}

/** A server-drawn score, in `view` if given; with `element`, the element's script loads and takes it over. */
const serverPage = (url: URL) =>
	html(
		`<style>${fontFaceCss("/render/fonts/Edwin-Roman.otf")}</style>${url.searchParams.has("element") ? ELEMENT : ""}`,
		renderScoreHtml(CHART, { theme: "dark", view: viewOf(url.searchParams.get("view")) }),
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

const verovio = join(root, "packages/score/node_modules/verovio/dist/verovio-module.mjs");
const gzipped = Bun.gzipSync(await Bun.file(verovio).bytes());
const JS = "text/javascript; charset=utf-8";

/** @barmark/engraver's compiled module and .wasm, or an exit saying how to get them. */
async function engraverDist(): Promise<{
	module: Uint8Array<ArrayBuffer>;
	wasm: Uint8Array<ArrayBuffer>;
}> {
	const dist = join(root, "packages/engraver/dist");
	const [module, wasm] = [
		Bun.file(join(dist, "verovio-module.mjs")),
		Bun.file(join(dist, "verovio-module.wasm")),
	];
	if (!((await module.exists()) && (await wasm.exists()))) {
		console.error(
			"packages/engraver/dist has no compiled module: run `cd packages/engraver && bun run compile`, or download CI's engraver-dist artifact",
		);
		process.exit(1);
	}
	return { module: await module.bytes(), wasm: await wasm.bytes() };
}

const engraver = await engraverDist();
/** The .wasm with its last byte flipped: the same size, another digest. */
const badWasm = engraver.wasm.slice();
badWasm[badWasm.length - 1] = (badWasm.at(-1) ?? 0) ^ 0xff;
const WASM = "application/wasm";
const engraverModule = () => new Response(engraver.module, { headers: { "content-type": JS } });

const server = Bun.serve({
	// Loopback only: nothing off this machine needs the suite's pages.
	hostname: "127.0.0.1",
	port: Number(process.env.PORT ?? 5261),
	routes: {
		"/score": (req) => scorePage(new URL(req.url)),
		"/server": (req) => serverPage(new URL(req.url)),
		"/score/worker.js": new Response(worker, { headers: { "content-type": JS } }),
		"/verovio/verovio-module.mjs": () =>
			new Response(Bun.file(verovio), { headers: { "content-type": JS } }),
		"/verovio-gz/verovio-module.mjs": () =>
			new Response(gzipped, { headers: { "content-type": JS, "content-encoding": "gzip" } }),
		"/engraver/ok/verovio-module.mjs": engraverModule,
		"/engraver/ok/verovio-module.wasm": () =>
			new Response(engraver.wasm, { headers: { "content-type": WASM } }),
		"/engraver/badwasm/verovio-module.mjs": engraverModule,
		"/engraver/badwasm/verovio-module.wasm": () =>
			new Response(badWasm, { headers: { "content-type": WASM } }),
		// No .wasm beside it: the request falls through to a 404.
		"/engraver/nowasm/verovio-module.mjs": engraverModule,
		"/verovio-gz-cors/verovio-module.mjs": () =>
			new Response(gzipped, {
				headers: {
					"content-type": JS,
					"content-encoding": "gzip",
					"access-control-allow-origin": "*",
				},
			}),
	},
	fetch: staticFile,
});
console.log(`score suite pages on ${server.url}`);
