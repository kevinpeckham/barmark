import { expect, type Locator, type Page, test } from "@playwright/test";
import { WASM_INTEGRITY_NEEDED } from "../src/wasm.js";

/** Counts, from now on, the page's requests for the score engine: engine.js, the worker or a Verovio module. */
function countEngine(page: Page): { worker: number; engine: number; urls: string[] } {
	const seen = { worker: 0, engine: 0, urls: [] as string[] };
	page.on("request", (r) => {
		const url = r.url();
		seen.urls.push(new URL(url).pathname);
		if (url.includes("worker.js")) seen.worker++;
		if (/\/score\/engine\.js$|worker\.js|verovio/.test(url)) seen.engine++;
	});
	return seen;
}

/** The score's engraved SVG pages, inside the element's shadow root. */
const scoreSvg = (el: Locator) => el.locator(".bms-pane .bms-score svg").first();

async function switchToScore(el: Locator) {
	await el.getByRole("radio", { name: "Score" }).click();
	await expect(scoreSvg(el)).toBeVisible({ timeout: 20_000 });
}

/** The lowest and highest luminance among a PNG's pixels, decoded by the browser itself. */
function luminanceRange(page: Page, png: Buffer): Promise<{ min: number; max: number }> {
	return page.evaluate(
		async (src) => {
			const img = new Image();
			img.src = src;
			await img.decode();
			const canvas = Object.assign(document.createElement("canvas"), {
				width: img.width,
				height: img.height,
			});
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("no canvas");
			ctx.drawImage(img, 0, 0);
			const data = ctx.getImageData(0, 0, img.width, img.height).data;
			let min = 255;
			let max = 0;
			for (let i = 0; i < data.length; i += 4) {
				const y =
					0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
				min = Math.min(min, y);
				max = Math.max(max, y);
			}
			return { min, max };
		},
		`data:image/png;base64,${png.toString("base64")}`,
	);
}

/** Opens `url` and waits for the network to settle, having asked for no engine. */
async function openQuiet(page: Page, url: string) {
	const seen = countEngine(page);
	await page.goto(url);
	const el = page.locator("barmark-score");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect(seen.engine).toBe(0);
	return { seen, el };
}

test("no engine request until the first switch", async ({ page }) => {
	const { seen, el } = await openQuiet(page, "/score");
	await switchToScore(el);
	expect(seen.worker).toBe(1);
	// engine.js, the worker, then the lighter build's .wasm beside it (stock, bundled in, is not needed).
	expect(seen.engine).toBe(3);
	expect(seen.urls).toContain("/score/verovio-module.wasm");
});

test("two scores, one engine request", async ({ page }) => {
	const seen = countEngine(page);
	await page.goto("/score?count=2");
	await switchToScore(page.locator("#s0"));
	await switchToScore(page.locator("#s1"));
	expect(seen.worker).toBe(1);
});

test("a server-drawn grid shows with JavaScript disabled", async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	// Asked for the score, it still draws the grid, and says so: Grid is the checked radio.
	await page.goto("/server?view=score");
	const el = page.locator("barmark-score");
	await expect(el).toHaveAttribute("view", "score");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await expect(el.locator(".bms-pane")).toBeHidden();
	await expect(el.getByRole("radiogroup", { name: "View" })).toBeVisible();
	await expect(el.getByRole("radio", { name: "Grid" })).toHaveAttribute("aria-checked", "true");
	await expect(el.getByRole("radio", { name: "Score" })).toHaveAttribute("aria-checked", "false");
	await context.close();
});

test("a server-drawn score asked for the score shows it once the element loads", async ({
	page,
}) => {
	await page.goto("/server?element&view=score");
	const el = page.locator("barmark-score");
	await expect(scoreSvg(el)).toBeVisible({ timeout: 20_000 });
	await expect(el.getByRole("radio", { name: "Score" })).toHaveAttribute("aria-checked", "true");
	await expect(el.locator(".bms-grid")).toBeHidden();
});

test("a server-drawn score switches once the element loads", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/server?element");
	const el = page.locator("barmark-score");
	await switchToScore(el);
	expect(await el.locator(".bms-pane .bm-chart").getAttribute("data-theme")).toBe("dark");
	await el.getByRole("radio", { name: "Grid" }).click();
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await expect(el.locator(".bms-pane")).toBeHidden();
	expect(errors).toEqual([]);
});

test("dark score is light on dark", async ({ page }) => {
	await page.goto("/score?theme=dark");
	const el = page.locator("barmark-score");
	const ink = await el.locator(".bms-grid .bm-chart").evaluate((e) => getComputedStyle(e).color);
	// render's dark ink, #ece8e0.
	expect(ink).toBe("rgb(236, 232, 224)");
	await switchToScore(el);
	const score = el.locator(".bms-pane .bms-score");
	expect(await score.evaluate((e) => getComputedStyle(e).color)).toBe(ink);
	// A staff line or a notehead: what Verovio fills or strokes with currentColor.
	const notehead = el.locator(".bms-score g.notehead use").first();
	expect(await notehead.evaluate((e) => getComputedStyle(e).fill)).toBe(ink);
	const staff = el.locator(".bms-score g.staff > path").first();
	expect(await staff.evaluate((e) => getComputedStyle(e).stroke)).toBe(ink);
	// And on screen: a bar's staff lines and slashes are drawn light, and its paper is dark.
	const box = await el.locator(".bms-score g.measure").first().boundingBox();
	if (!box) throw new Error("no bar");
	const { min, max } = await luminanceRange(page, await page.screenshot({ clip: box }));
	expect(max).toBeGreaterThan(128);
	expect(min).toBeLessThan(128);
});

test("a bad verovio-url keeps the grid with a note", async ({ page }) => {
	const seen = countEngine(page);
	await page.goto("/score?engine=missing");
	const el = page.locator("barmark-score");
	await el.getByRole("radio", { name: "Score" }).click();
	await expect(el.getByRole("status")).toHaveText("The score couldn't be drawn", {
		timeout: 20_000,
	});
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await expect(el.locator(".bms-pane")).toBeHidden();
	await expect(el.getByRole("radio", { name: "Score" })).toHaveAttribute("aria-disabled", "true");
	expect(seen.worker).toBe(1);
	// The failure is the worker's import of that URL, not something earlier.
	expect(seen.urls).toContain("/nope/verovio.mjs");
});

test("a data: verovio-url shows the note without starting the worker", async ({ page }) => {
	const seen = countEngine(page);
	await page.goto("/score?engine=data");
	const el = page.locator("barmark-score");
	await el.getByRole("radio", { name: "Score" }).click();
	await expect(el.getByRole("status")).toHaveText("The score couldn't be drawn");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect(seen.worker).toBe(0);
});

test("the page server takes no module URL and caps count", async ({ request }) => {
	const url = encodeURIComponent("https://example.com/evil.mjs");
	expect((await request.get(`/score?verovio-url=${url}`)).status()).toBe(400);
	expect((await request.get("/score?engine=other")).status()).toBe(400);
	expect((await request.get("/score?count=1000000")).status()).toBe(400);
	expect((await request.get("/score?count=2")).status()).toBe(200);
});

test("resizing reflows the score", async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 900 });
	await page.goto("/score");
	const el = page.locator("barmark-score");
	await switchToScore(el);
	const systems = () => el.locator(".bms-score g.system").count();
	const height = () => el.locator(".bms-score").evaluate((e) => e.getBoundingClientRect().height);
	const wide = { systems: await systems(), height: await height() };
	expect(wide.systems).toBeGreaterThan(0);
	// Whether the pane ever stops holding a score, or says it is loading, while it reflows.
	await el.evaluate((host) => {
		const pane = host.shadowRoot?.querySelector(".bms-pane");
		if (!pane) throw new Error("no pane");
		const seen = { blank: false, busy: false };
		Object.assign(window, { reflow: seen });
		new MutationObserver(() => {
			if (!pane.querySelector(".bms-score svg") || pane.querySelector(".bms-loading"))
				seen.blank = true;
			if (pane.getAttribute("aria-busy") === "true") seen.busy = true;
		}).observe(pane, { childList: true, subtree: true, attributes: true, characterData: true });
	});
	await page.setViewportSize({ width: 480, height: 900 });
	await expect.poll(systems, { timeout: 20_000 }).toBeGreaterThan(wide.systems);
	expect(await height()).toBeGreaterThan(wide.height);
	const reflow = await page.evaluate(() => (window as unknown as { reflow: object }).reflow);
	expect(reflow).toEqual({ blank: false, busy: true });
	await expect(el.locator(".bms-pane")).not.toHaveAttribute("aria-busy", "true");
});

/** The Grid radio's text colour and the switch's border, as computed. */
const switchColours = (el: Locator) =>
	el.getByRole("radio", { name: "Grid" }).evaluate((b) => ({
		ink: getComputedStyle(b).color,
		rule: getComputedStyle(b.parentElement as Element).borderTopColor,
	}));
// render's palettes: ink and rule.
const LIGHT = { ink: "rgb(29, 29, 31)", rule: "rgb(74, 74, 74)" };
const DARK = { ink: "rgb(236, 232, 224)", rule: "rgb(143, 137, 127)" };

test("the switch follows the element's theme, as the grid does", async ({ page }) => {
	await page.emulateMedia({ colorScheme: "light" });
	await page.goto("/score?theme=dark");
	expect(await switchColours(page.locator("barmark-score"))).toEqual(DARK);
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/score?theme=light");
	expect(await switchColours(page.locator("barmark-score"))).toEqual(LIGHT);
	await page.goto("/score");
	expect(await switchColours(page.locator("barmark-score"))).toEqual(DARK);
	await page.goto("/score?theme=auto");
	expect(await switchColours(page.locator("barmark-score"))).toEqual(DARK);
	await page.emulateMedia({ colorScheme: "light" });
	expect(await switchColours(page.locator("barmark-score"))).toEqual(LIGHT);
	// Printed, every theme is light, as render prints the grid.
	await page.goto("/score?theme=dark");
	await page.emulateMedia({ media: "print" });
	expect(await switchColours(page.locator("barmark-score"))).toEqual(LIGHT);
});

test("a server-drawn switch follows its theme with JavaScript disabled", async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light" });
	const page = await context.newPage();
	await page.goto("/server");
	expect(await switchColours(page.locator("barmark-score"))).toEqual(DARK);
	await context.close();
});

test("the switch's font is the chart's label font, not the page's initial serif", async ({
	page,
}) => {
	await page.goto("/score");
	const font = await page
		.locator("barmark-score")
		.getByRole("radio", { name: "Grid" })
		.evaluate((b) => getComputedStyle(b).fontFamily);
	expect(font).toContain("system-ui");
});

test("chord accidentals and the tempo's note draw in Leipzig, registered with the document", async ({
	page,
}) => {
	await page.goto("/score?chart=sharps");
	const el = page.locator("barmark-score");
	await switchToScore(el);
	// A face declared only inside the shadow root's SVG is one Chromium never loads.
	const leipzig = await page.evaluate(async () => {
		await document.fonts.load('12px "Leipzig"', "\uE262");
		return [...document.fonts]
			.filter((f) => f.family.replaceAll('"', "") === "Leipzig")
			.map((f) => f.status);
	});
	expect(leipzig).toEqual(["loaded"]);
	// One copy for the page, however many scores show it.
	await page.goto("/score?chart=sharps&count=2");
	await switchToScore(page.locator("#s0"));
	await switchToScore(page.locator("#s1"));
	expect(await page.locator("head style[data-barmark-score-font]").count()).toBe(1);
});

/** What the loading region showed, each time it changed: its live text, the bar's value and the amount. */
type Seen = { text: string; now: number | null; amount: string };

/** Starts recording the loading region of `el` as it changes. */
async function watchLoading(el: Locator): Promise<() => Promise<Seen[]>> {
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await el.evaluate((host) => {
		const pane = host.shadowRoot?.querySelector(".bms-pane");
		if (!pane) throw new Error("no pane");
		const seen: Seen[] = [];
		Object.assign(window, { loading: seen });
		new MutationObserver(() => {
			const box = pane.querySelector(".bms-loading");
			if (!box) return;
			const now = box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow");
			seen.push({
				text: box.querySelector('[role="status"]')?.textContent ?? "",
				now: now == null ? null : Number(now),
				amount: box.querySelector(".bms-amount")?.textContent ?? "",
			});
		}).observe(pane, { childList: true, subtree: true, attributes: true, characterData: true });
	});
	return () => el.page().evaluate(() => (window as unknown as { loading: Seen[] }).loading);
}

const LOADING = "Loading the score engine…";

/** A measured download: some percentages seen, never falling, reaching 100. */
function expectRisingTo100(nows: number[]) {
	expect(nows.length).toBeGreaterThan(0);
	expect(Math.max(...nows)).toBe(100);
	expect(nows.every((n, i) => i === 0 || n >= (nows[i - 1] as number))).toBe(true);
}

test("a real load shows its measured progress, preparing, then the score", async ({ page }) => {
	await page.goto("/score?engine=local");
	const el = page.locator("barmark-score");
	const seen = await watchLoading(el);
	await switchToScore(el);
	const log = await seen();
	const measured = log.filter((s) => s.text === LOADING && s.now !== null);
	expect(measured.length).toBeGreaterThan(0);
	// Not encoded: measured against Content-Length, with the real transfer size shown.
	expect(Math.max(...measured.map((s) => s.now as number))).toBe(100);
	const nows = measured.map((s) => s.now as number);
	expect(nows.every((n, i) => i === 0 || n >= (nows[i - 1] as number))).toBe(true);
	expect(measured.at(-1)?.amount).toBe("100% (7.4 of 7.4 MB)");
	const phases = [...new Set(log.map((s) => s.text))];
	expect(phases.slice(0, 2)).toEqual([LOADING, "Preparing…"]);
	expect(log.filter((s) => s.text !== LOADING).every((s) => s.now === null)).toBe(true);
});

for (const [engine, how] of [
	["gzip", "same-origin"],
	["gzip-cross", "cross-origin, its Content-Encoding hidden,"],
])
	test(`a gzipped load ${how} is measured against the decoded size, rising to 100%`, async ({
		page,
	}) => {
		// The digest names the file, and so its decoded size.
		await page.goto(`/score?engine=${engine}&integrity=good`);
		const el = page.locator("barmark-score");
		const seen = await watchLoading(el);
		await switchToScore(el);
		const measured = (await seen()).filter((s) => s.text === LOADING && s.now !== null);
		expectRisingTo100(measured.map((s) => s.now as number));
		// Content-Length is the compressed size: no "of … MB" for it.
		expect(measured.every((s) => !s.amount.includes("MB"))).toBe(true);
	});

test("a gzipped load with no digest shows no percentage, never one against 7.4 MB", async ({
	page,
}) => {
	await page.goto("/score?engine=gzip");
	const el = page.locator("barmark-score");
	const seen = await watchLoading(el);
	await switchToScore(el);
	const log = await seen();
	expect(log.some((s) => s.text === LOADING)).toBe(true);
	expect(log.filter((s) => s.text === LOADING).every((s) => s.now === null)).toBe(true);
});

test("the indeterminate bar stands still with reduced motion", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/score");
	const el = page.locator("barmark-score");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	const animation = await el.evaluate((host) => {
		const pane = host.shadowRoot?.querySelector(".bms-pane") as HTMLElement;
		pane.hidden = false;
		pane.innerHTML =
			'<div class="bms-loading"><p class="bms-status"></p><div class="bms-bar" role="progressbar"><span></span></div></div>';
		return getComputedStyle(pane.querySelector(".bms-bar > span") as Element).animationName;
	});
	expect(animation).toBe("none");
});

const LOCAL = "/verovio/verovio-module.mjs";

/** The page's console warnings, the worker's among them, from now on. */
function consoleWarnings(page: Page): string[] {
	const warnings: string[] = [];
	page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
	return warnings;
}

/** Opens `url` and waits for the grid: the element, ready for a press. */
async function openGrid(page: Page, url: string): Promise<Locator> {
	await page.goto(url);
	const el = page.locator("barmark-score");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	return el;
}

/** Opens `/score?query`, presses Score and waits for it: the console's warnings and the engine's requests. */
async function scoreWith(page: Page, query: string) {
	const warnings = consoleWarnings(page);
	const seen = countEngine(page);
	await page.goto(`/score?${query}`);
	const el = page.locator("barmark-score");
	await switchToScore(el);
	return { el, warnings, local: seen.urls.filter((u) => u === LOCAL).length };
}

test("@loading verovio-integrity: a matching copy is used", async ({ page }) => {
	const { warnings, local } = await scoreWith(page, "engine=local&integrity=good");
	expect(local).toBe(1);
	expect(warnings).toEqual([]);
});

test("@loading verovio-integrity: a mismatch falls back to the package's own copy, with a warning", async ({
	page,
}) => {
	const { el, warnings, local } = await scoreWith(page, "engine=local&integrity=bad");
	expect(local).toBe(1);
	expect(warnings).toHaveLength(1);
	expect(warnings[0]).toContain(LOCAL);
	expect(warnings[0]).toContain("integrity");
	await expect(el.locator(".bms-note")).toHaveCount(0);
});

test('preload="idle" loads the engine before a press, once', async ({ page }) => {
	const seen = countEngine(page);
	await page.goto("/score?engine=local&preload=idle");
	await expect
		.poll(() => seen.urls.filter((u) => u === LOCAL).length, {
			timeout: 10_000,
		})
		.toBe(1);
	expect(seen.worker).toBe(1);
	const el = page.locator("barmark-score");
	// The load is underway or done: the press finds the engine past downloading.
	await page.waitForLoadState("networkidle");
	const watched = await watchLoading(el);
	await switchToScore(el);
	expect((await watched()).some((s) => s.text === LOADING)).toBe(false);
	expect(seen.urls.filter((u) => u === LOCAL)).toHaveLength(1);
	expect(seen.worker).toBe(1);
});

test('preload="intent" loads the engine on hovering Score, not before', async ({ page }) => {
	const { seen, el } = await openQuiet(page, "/score?engine=local&preload=intent");
	await el.getByRole("radio", { name: "Score" }).hover();
	await expect.poll(() => seen.worker, { timeout: 10_000 }).toBe(1);
	expect(await el.getAttribute("view")).toBeNull();
});

/** Where the lite build's requests go, for each of the server's copies of it. */
const lite = (copy: string) => ({
	module: `/engraver/${copy}/verovio-module.mjs`,
	wasm: `/engraver/${copy}/verovio-module.wasm`,
});

test("@loading the lite build: both digests match, it is used, its wasm measured", async ({
	page,
}) => {
	const warnings = consoleWarnings(page);
	const seen = countEngine(page);
	await page.goto("/score?lite=ok");
	const el = page.locator("barmark-score");
	const loading = await watchLoading(el);
	await switchToScore(el);
	expect(warnings).toEqual([]);
	expect(seen.urls.filter((u) => u === lite("ok").module)).toHaveLength(1);
	expect(seen.urls.filter((u) => u === lite("ok").wasm)).toHaveLength(1);
	// The glue is unmeasured; the .wasm is measured, rising to 100% once.
	const nows = (await loading())
		.filter((s) => s.text === LOADING && s.now !== null)
		.map((s) => s.now as number);
	expectRisingTo100(nows);
});

test("@loading a wasm digest mismatch falls back to the package's own copy, with a warning", async ({
	page,
}) => {
	const { el, warnings } = await scoreWith(page, "lite=badwasm");
	expect(warnings).toHaveLength(1);
	expect(warnings[0]).toContain(lite("badwasm").module);
	expect(warnings[0]).toContain(lite("badwasm").wasm);
	expect(warnings[0]).toContain("integrity");
	await expect(el.locator(".bms-note")).toHaveCount(0);
});

test("@loading a missing .wasm falls back in seconds, not at the load deadline", async ({
	page,
}) => {
	const warnings = consoleWarnings(page);
	const el = await openGrid(page, "/score?lite=nowasm");
	await el.getByRole("radio", { name: "Score" }).click();
	// The hung factory is raced: well inside the engine's 60-second deadline.
	await expect(scoreSvg(el)).toBeVisible({ timeout: 15_000 });
	expect(warnings).toHaveLength(1);
	expect(warnings[0]).toContain(lite("nowasm").module);
});

test("@loading verovio-integrity without verovio-wasm-integrity falls back, saying why", async ({
	page,
}) => {
	const { el, warnings } = await scoreWith(page, "lite=nowasmintegrity");
	expect(warnings).toHaveLength(1);
	expect(warnings[0]).toContain(WASM_INTEGRITY_NEEDED);
	await expect(el.locator(".bms-note")).toHaveCount(0);
});

test("stock Verovio with a wasm digest loads cleanly: it never asks for a .wasm", async ({
	page,
}) => {
	const seen = countEngine(page);
	const { el, warnings, local } = await scoreWith(
		page,
		"engine=local&integrity=good&wasmintegrity=lite",
	);
	expect(local).toBe(1);
	expect(warnings).toEqual([]);
	expect(seen.urls.some((u) => u.endsWith(".wasm"))).toBe(false);
	await expect(el.locator(".bms-note")).toHaveCount(0);
});

/** What the worker warns when the package's lighter Verovio gives way to stock. */
const NOT_USED = "the lighter Verovio was not used";

/**
 * Watches a page at `/<scenario>/score`, from before it opens: our warnings
 * that the lighter build was not used, and the requests for the `.wasm`
 * beside the worker with the status of each one answered.
 */
function watchLite(page: Page, scenario: string) {
	const wasm = `/${scenario}/score/verovio-module.wasm`;
	const seen = { notUsed: [] as string[], asked: 0, answered: [] as number[], workers: 0 };
	page.on("console", (m) => {
		if (m.text().includes(NOT_USED)) seen.notUsed.push(m.text());
	});
	page.on("request", (r) => {
		const path = new URL(r.url()).pathname;
		if (path === wasm) seen.asked++;
		if (path === `/${scenario}/score/worker.js`) seen.workers++;
	});
	page.on("response", (r) => {
		if (new URL(r.url()).pathname === wasm) seen.answered.push(r.status());
	});
	return seen;
}

/** Opens `/<scenario>/score`, presses Score and waits for an engraved bar. */
async function engraveIn(page: Page, scenario: string) {
	const seen = watchLite(page, scenario);
	const el = await openGrid(page, `/${scenario}/score`);
	await el.getByRole("radio", { name: "Score" }).click();
	await expect(el.locator(".bms-score svg g.measure").first()).toBeVisible({ timeout: 20_000 });
	return seen;
}

/** The lighter build engraved: its `.wasm` was asked for and answered, and nothing gave way to stock. */
function expectLighter(seen: ReturnType<typeof watchLite>, answers = 1) {
	expect(seen.answered).toEqual(Array(answers).fill(200));
	expect(seen.notUsed).toEqual([]);
}

/** Stock engraved: the lighter build gave way to it, saying so once. */
function expectStock(seen: ReturnType<typeof watchLite>) {
	expect(seen.notUsed).toHaveLength(1);
}

test("@loading the package's own copy is the lighter build", async ({ page }) => {
	const seen = await engraveIn(page, "ok");
	expect(seen.asked).toBe(1);
	expectLighter(seen);
});

test("@loading a missing .wasm falls back to stock, with the warning", async ({ page }) => {
	const seen = await engraveIn(page, "nowasm");
	// The glue asks again after its streaming compile fails: every answer a 404.
	expect(seen.answered.length).toBeGreaterThan(0);
	expect(new Set(seen.answered)).toEqual(new Set([404]));
	expectStock(seen);
});

test("@loading a .wasm cut short falls back to stock", async ({ page }) => {
	// Its first half: the magic bytes, then a section running past the end, so it cannot compile.
	const seen = await engraveIn(page, "badwasm");
	// The glue asks again after its streaming compile fails: every answer a 200.
	expect(seen.answered.length).toBeGreaterThan(0);
	expect(new Set(seen.answered)).toEqual(new Set([200]));
	expectStock(seen);
});

test("@loading a .wasm that never arrives falls back at the lighter build's deadline", async ({
	page,
}) => {
	// The hang scenario's worker is built with a 1.5 s deadline, not the package's 20 s.
	const seen = await engraveIn(page, "hang");
	expect(seen.asked).toBe(1);
	expect(seen.answered).toEqual([]);
	expectStock(seen);
	expect(seen.notUsed[0]).toContain("no answer in");
});

test("@loading a .wasm served as text/plain still loads the lighter build", async ({ page }) => {
	// The glue's streaming compile refuses the type and reads the bytes instead: the browser's warning, not ours.
	const seen = await engraveIn(page, "plain");
	expect(seen.asked).toBeGreaterThan(0);
	expectLighter(seen, seen.asked);
});

/**
 * A chart whose engraving takes far past the engine's 3 s grace for a
 * superseded job (about 15 s here): 9,600 bars, under the parser's
 * 10,000-bar limit.
 */
const LONG_CHART = `# Long\nkey: C, time: 4/4\n\n${"| C | Am7 | Dm7 | G7 |\n".repeat(2400)}`;

/** Gives the element a new chart through its `text` property. */
const setText = (el: Locator, text: string) =>
	el.evaluate((host, t) => {
		(host as HTMLElement & { text: string }).text = t;
	}, text);

test("@loading a replacement worker loads the lighter build again", async ({ page }) => {
	const seen = watchLite(page, "ok");
	const el = await openGrid(page, "/ok/score");
	await setText(el, LONG_CHART);
	await el.getByRole("radio", { name: "Score" }).click();
	await expect.poll(() => seen.answered, { timeout: 20_000 }).toEqual([200]);
	// A new chart supersedes the long one still engraving: past its grace the worker is cut off,
	// and a fresh one loads the Verovio the first one loaded, the lighter build.
	await setText(el, "# Short\n| C | G |\n");
	await expect(el.locator(".bms-score svg g.measure")).toHaveCount(2, { timeout: 20_000 });
	expect(seen.workers).toBe(2);
	expectLighter(seen, 2);
});

test('switch="off": no switch to see or tab to; script drives the view', async ({ page }) => {
	await page.goto("/score?switch=off&engine=local");
	const el = page.locator("barmark-score");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await expect(el.locator(".bms-switch")).toBeHidden();
	await expect(el.getByRole("radio", { name: "Score" })).toBeHidden();

	// Tab reaches nothing inside the element.
	await page.keyboard.press("Tab");
	expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");

	await page.evaluate(() => {
		const w = window as unknown as { views: string[] };
		w.views = [];
		document
			.querySelector("barmark-score")
			?.addEventListener("viewchange", (e) =>
				w.views.push((e as CustomEvent<{ view: string }>).detail.view),
			);
		(document.querySelector("barmark-score") as HTMLElement & { view: string }).view = "score";
	});
	await expect(scoreSvg(el)).toBeVisible({ timeout: 20_000 });
	await expect(el.locator(".bms-switch")).toBeHidden();

	await page.evaluate(() => {
		(document.querySelector("barmark-score") as HTMLElement & { view: string }).view = "grid";
	});
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await expect(scoreSvg(el)).toBeHidden();
	expect(await page.evaluate(() => (window as unknown as { views: string[] }).views)).toEqual([
		"score",
		"grid",
	]);
});

test("without switch=off the switch is visible", async ({ page }) => {
	await page.goto("/score");
	await expect(page.locator("barmark-score .bms-switch")).toBeVisible();
});
