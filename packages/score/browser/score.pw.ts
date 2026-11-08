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
	await page.goto("/server");
	const el = page.locator("barmark-score");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await expect(el.getByRole("radiogroup", { name: "View" })).toBeVisible();
	await expect(el.getByRole("radio", { name: "Grid" })).toHaveAttribute("aria-checked", "true");
	await expect(el.getByRole("radio", { name: "Score" })).toBeVisible();
	await context.close();
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
	await page.goto(`/score?verovio-url=${encodeURIComponent("/nope/verovio.mjs")}`);
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
	const data = "data:text/javascript,export default async () => ({})";
	await page.goto(`/score?verovio-url=${encodeURIComponent(data)}`);
	const el = page.locator("barmark-score");
	await el.getByRole("radio", { name: "Score" }).click();
	await expect(el.getByRole("status")).toHaveText("The score couldn't be drawn");
	await expect(el.locator(".bms-grid .bm-chart")).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect(seen.worker).toBe(0);
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
	await page.setViewportSize({ width: 480, height: 900 });
	await expect.poll(systems, { timeout: 20_000 }).toBeGreaterThan(wide.systems);
	expect(await height()).toBeGreaterThan(wide.height);
});
