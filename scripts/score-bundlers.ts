/**
 * Bundles a page that uses `<barmark-score>` with a real Vite build and a real
 * plain esbuild bundle, opens each in Chromium and checks which Verovio drew
 * the score (the claims in packages/score/README.md, "Bundlers and the lighter
 * build"):
 *
 * - Vite emits the lighter build's `.wasm` and engraves with it; with
 *   `worker.format: "es"` the worker is small and stock Verovio is a chunk of
 *   its own.
 * - esbuild (`bundle`, `esm`, `node:*` external, no splitting) emits no `.wasm`:
 *   the lighter build is asked for, not found, and stock Verovio draws the
 *   score after exactly one console warning.
 *
 * Run `bun run build` first. Writes only into a `mkdtemp` directory.
 */
import { copyFile, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build as esbuild } from "esbuild";
import { build as vite } from "vite";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const fixture = join(root, "packages/score/tests/fixtures/bundlers");
const scoreDist = join(root, "packages/score/dist");
const FALLBACK = "the lighter Verovio was not used";
const WORKER_MAX = 1_000_000;

const TYPES: Record<string, string> = {
	".html": "text/html",
	".js": "text/javascript",
	".mjs": "text/javascript",
	".wasm": "application/wasm",
	".css": "text/css",
};

/** The file `urlPath` names inside `base`; throws for a path that leaves it. */
function insideOf(base: string, urlPath: string): string {
	const file = resolve(base, `.${urlPath === "/" ? "/index.html" : urlPath}`);
	if (!file.startsWith(base + sep)) throw new Error("outside the directory");
	return file;
}

/** Static files from `dir` on loopback, an ephemeral port, nothing outside `dir`. */
function serve(dir: string): Promise<{ server: Server; url: string }> {
	const base = resolve(dir);
	const server = createServer(async (req, res) => {
		try {
			const file = insideOf(base, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
			const bytes = await Bun.file(file).bytes();
			res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
			res.end(bytes);
		} catch {
			res.writeHead(404).end();
		}
	});
	return new Promise((done) =>
		server.listen(0, "127.0.0.1", () =>
			done({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` }),
		),
	);
}

type Seen = { drew: boolean; wasm: number; fallbacks: number; messages: string[] };

/** Opens `dir` in a fresh page; collects the console and responses from before navigation. */
async function open(dir: string): Promise<Seen> {
	const { server, url } = await serve(dir);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const seen: Seen = { drew: false, wasm: 0, fallbacks: 0, messages: [] };
		page.on("console", (m) => {
			seen.messages.push(m.text());
			if (m.text().includes(FALLBACK)) seen.fallbacks++;
		});
		page.on("response", (r) => {
			if (r.url().endsWith(".wasm") && r.status() === 200) seen.wasm++;
		});
		await page.goto(url);
		seen.drew = await page
			.locator("barmark-score .bms-score g.measure")
			.first()
			.waitFor({ timeout: 30_000 })
			.then(
				() => true,
				() => false,
			);
		return seen;
	} finally {
		await browser.close();
		server.close();
	}
}

async function files(dir: string): Promise<{ name: string; size: number }[]> {
	const out: { name: string; size: number }[] = [];
	for (const e of await readdir(dir, { recursive: true, withFileTypes: true })) {
		if (!e.isFile()) continue;
		const full = join(e.parentPath, e.name);
		out.push({ name: full.slice(dir.length + 1), size: (await stat(full)).size });
	}
	return out;
}

const kB = (n: number) => `${Math.round(n / 1000)} kB`;

/** The problems with a bundler's run, empty when it is as the README says. */
function problems(
	seen: Seen,
	want: { wasm: boolean; fallbacks: number },
	built: string[],
): string[] {
	const hasWasm = built.some((n) => n.endsWith(".wasm"));
	return [
		[hasWasm !== want.wasm, `a .wasm in the output: ${hasWasm}, wanted ${want.wasm}`],
		[!seen.drew, "the score did not draw"],
		[seen.wasm > 0 !== want.wasm, `a .wasm answered 200: ${seen.wasm > 0}, wanted ${want.wasm}`],
		[
			seen.fallbacks !== want.fallbacks,
			`${seen.fallbacks} "${FALLBACK}" warnings, wanted ${want.fallbacks}`,
		],
	]
		.filter(([bad]) => bad)
		.map(([, why]) => String(why));
}

const tmp = await mkdtemp(join(tmpdir(), "score-bundlers-"));
const failures: string[] = [];
try {
	// Vite follows `new URL("./worker.js", import.meta.url)` and builds the worker itself.
	const viteDir = join(tmp, "vite");
	await vite({
		root: fixture,
		configFile: false,
		logLevel: "silent",
		worker: { format: "es" },
		build: { outDir: viteDir, emptyOutDir: true, target: "es2022" },
	});
	const viteFiles = await files(viteDir);
	const names = viteFiles.map((f) => f.name);
	const worker = viteFiles.find((f) => /(^|\/)worker-[^/]*\.js$/.test(f.name));
	const biggest = viteFiles
		.filter((f) => f.name.endsWith(".js") && f !== worker)
		.sort((a, b) => b.size - a.size)[0];
	const wasm = viteFiles.find((f) => f.name.endsWith(".wasm"));
	const viteBad = problems(await open(viteDir), { wasm: true, fallbacks: 0 }, names);
	if (!worker) viteBad.push("no worker file in the output");
	else if (worker.size >= WORKER_MAX)
		viteBad.push(`the worker is ${kB(worker.size)}: stock Verovio is inside it`);
	if (!biggest || biggest.size < 1_000_000) viteBad.push("no separate chunk holds stock Verovio");
	console.log(
		`vite: ${viteBad.length ? "FAILED" : "lighter build, .wasm emitted"} (worker ${kB(worker?.size ?? 0)}, wasm ${kB(wasm?.size ?? 0)}, stock chunk ${kB(biggest?.size ?? 0)})`,
	);
	for (const b of viteBad) failures.push(`vite: ${b}`);

	// esbuild does not follow `new URL(...)`: the worker is a second entry point, as
	// worker.js beside main.js, where the element's URL resolves (named with `out`: the two
	// entries have no common folder, and esbuild would otherwise nest them by their paths).
	const esDir = join(tmp, "esbuild");
	await esbuild({
		entryPoints: [
			{ in: join(fixture, "main.js"), out: "main" },
			{ in: join(scoreDist, "worker.js"), out: "worker" },
		],
		outdir: esDir,
		bundle: true,
		format: "esm",
		external: ["node:*"],
		logLevel: "silent",
	});
	await copyFile(join(fixture, "index.html"), join(esDir, "index.html"));
	const esBad = problems(
		await open(esDir),
		{ wasm: false, fallbacks: 1 },
		(await files(esDir)).map((f) => f.name),
	);
	console.log(`esbuild: ${esBad.length ? "FAILED" : "stock after one fallback"}`);
	for (const b of esBad) failures.push(`esbuild: ${b}`);
} finally {
	await rm(tmp, { recursive: true, force: true });
}

if (failures.length) {
	for (const f of failures) console.error(`  ${f}`);
	process.exit(1);
}
