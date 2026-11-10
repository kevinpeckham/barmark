import { expect, type Locator, type Page, test } from "@playwright/test";

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

test("no engine request until the first switch", async ({ page }) => {
	const seen = countEngine(page);
	await page.goto("/score");
	const el = page.locator("barmark-score");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect(seen.engine).toBe(0);
	await switchToScore(el);
	expect(seen.worker).toBe(1);
	// engine.js, then the worker (Verovio is bundled into it).
	expect(seen.engine).toBe(2);
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
		await page.goto(`/score?engine=${engine}`);
		const el = page.locator("barmark-score");
		const seen = await watchLoading(el);
		await switchToScore(el);
		const measured = (await seen()).filter((s) => s.text === LOADING && s.now !== null);
		const nows = measured.map((s) => s.now as number);
		expect(nows.length).toBeGreaterThan(0);
		expect(Math.max(...nows)).toBe(100);
		expect(nows.every((n, i) => i === 0 || n >= (nows[i - 1] as number))).toBe(true);
		// Content-Length is the compressed size: no "of … MB" for it.
		expect(measured.every((s) => !s.amount.includes("MB"))).toBe(true);
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

test("verovio-integrity: a matching copy is used", async ({ page }) => {
	const warnings: string[] = [];
	page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
	const seen = countEngine(page);
	await page.goto("/score?engine=local&integrity=good");
	await switchToScore(page.locator("barmark-score"));
	expect(seen.urls.filter((u) => u === "/verovio/verovio-module.mjs")).toHaveLength(1);
	expect(warnings).toEqual([]);
});

test("verovio-integrity: a mismatch falls back to the package's own copy, with a warning", async ({
	page,
}) => {
	const warnings: string[] = [];
	page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
	const seen = countEngine(page);
	await page.goto("/score?engine=local&integrity=bad");
	const el = page.locator("barmark-score");
	await switchToScore(el);
	expect(seen.urls.filter((u) => u === "/verovio/verovio-module.mjs")).toHaveLength(1);
	expect(warnings).toHaveLength(1);
	expect(warnings[0]).toContain("/verovio/verovio-module.mjs");
	expect(warnings[0]).toContain("integrity");
	await expect(el.locator(".bms-note")).toHaveCount(0);
});

test('preload="idle" loads the engine before a press, once', async ({ page }) => {
	const seen = countEngine(page);
	await page.goto("/score?engine=local&preload=idle");
	await expect
		.poll(() => seen.urls.filter((u) => u === "/verovio/verovio-module.mjs").length, {
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
	expect(seen.urls.filter((u) => u === "/verovio/verovio-module.mjs")).toHaveLength(1);
	expect(seen.worker).toBe(1);
});

test('preload="intent" loads the engine on hovering Score, not before', async ({ page }) => {
	const seen = countEngine(page);
	await page.goto("/score?engine=local&preload=intent");
	const el = page.locator("barmark-score");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect(seen.engine).toBe(0);
	await el.getByRole("radio", { name: "Score" }).hover();
	await expect.poll(() => seen.worker, { timeout: 10_000 }).toBe(1);
	expect(await el.getAttribute("view")).toBeNull();
});
