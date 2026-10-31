import { expect, type Page, test } from "@playwright/test";

/** Evaluate inside a chart's shadow root. */
const inChart = <T>(page: Page, fn: (root: ShadowRoot) => T, selector = "barmark-chart") =>
	page
		.locator(selector)
		.first()
		.evaluate((el, src) => {
			const root = (el as HTMLElement).shadowRoot;
			if (!root) throw new Error("no shadow root");
			return new Function("root", `return (${src})(root)`)(root);
		}, fn.toString()) as Promise<T>;

/** The chart's pixels, cut to whole pixels so no page background shows at a fractional edge. */
async function chartPixels(page: Page, path: string) {
	await page.goto(path);
	await page.evaluate(() => document.fonts.ready);
	const box = await page.locator("barmark-chart").boundingBox();
	if (!box) throw new Error("no chart");
	const clip = { x: box.x, y: box.y, width: Math.floor(box.width), height: Math.floor(box.height) };
	return page.screenshot({ clip, fullPage: true });
}

const paper = (page: Page) =>
	inChart(
		page,
		(root) => getComputedStyle(root.querySelector(".bm-chart") as Element).backgroundColor,
	);

test.describe("isolation", () => {
	test("hostile page CSS changes nothing inside the chart", async ({ page }) => {
		const plain = await chartPixels(page, "/chart?width=900");
		const hostile = await chartPixels(page, "/hostile?width=900");
		expect(hostile.equals(plain)).toBe(true);
	});

	test("the font loads as barmark Edwin", async ({ page }) => {
		await page.goto("/chart");
		const loaded = await page.evaluate(async () => {
			await document.fonts.ready;
			return document.fonts.check('1em "barmark Edwin"');
		});
		expect(loaded).toBe(true);
	});
});

test.describe("themes", () => {
	test("auto follows the system; dark and light force themselves", async ({ page }) => {
		await page.goto("/chart");
		expect(await paper(page)).toBe("rgb(255, 253, 248)");
		await page.emulateMedia({ colorScheme: "dark" });
		expect(await paper(page)).toBe("rgb(27, 26, 24)");
		await page.goto("/chart?theme=light");
		expect(await paper(page)).toBe("rgb(255, 253, 248)");
		await page.emulateMedia({ colorScheme: "light" });
		await page.goto("/chart?theme=dark");
		expect(await paper(page)).toBe("rgb(27, 26, 24)");
	});

	test("the page's custom properties win", async ({ page }) => {
		await page.goto(`/chart?css=${encodeURIComponent("barmark-chart{--barmark-paper:#123456}")}`);
		expect(await paper(page)).toBe("rgb(18, 52, 86)");
	});

	test("printing is light", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "dark", media: "print" });
		await page.goto("/chart");
		expect(await paper(page)).toBe("rgb(255, 253, 248)");
	});
});

test.describe("reflow", () => {
	for (const [name, width, css] of [
		["a phone", 360, ""],
		["400% zoom", 320, ""],
		["large text on a phone", 360, "barmark-chart{--barmark-size:2.5rem}"],
	] as const)
		test(`a long row wraps on ${name} without scrolling sideways`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(
				`/chart?chart=long&css=${encodeURIComponent(`body{margin:0}barmark-chart{margin:0}${css}`)}`,
			);
			const { scroll, client } = await page.evaluate(() => ({
				scroll: document.documentElement.scrollWidth,
				client: document.documentElement.clientWidth,
			}));
			expect(scroll).toBeLessThanOrEqual(client);
		});

	test("a wide screen keeps the columns aligned", async ({ page }) => {
		await page.setViewportSize({ width: 1600, height: 800 });
		await page.goto("/chart?chart=long");
		const display = await inChart(
			page,
			(root) => getComputedStyle(root.querySelector(".bm-grid") as Element).display,
		);
		expect(display).toBe("grid");
	});
});

test.describe("the element", () => {
	test("renders inline text, a src, and a failed src", async ({ page }) => {
		await page.goto("/element");
		await expect(page.locator("#inline .bm-heading")).toHaveText("Verse");
		await expect(page.locator("#remote .bm-title")).toHaveText("Example Song");
		await expect(page.locator("#remote .bm-rehearsal").first()).toHaveText("A");
		await expect(page.locator("#missing .bm-error")).toContainText(
			"Could not load /nope.chart.md: 404",
		);
	});

	test("re-renders when its text or attributes change", async ({ page }) => {
		await page.goto("/element");
		await expect(page.locator("#inline .bm-heading")).toHaveText("Verse");
		await page.evaluate(() => {
			const script = document.querySelector("#inline script");
			if (script) script.textContent = "## Chorus\n| G |";
		});
		await expect(page.locator("#inline .bm-heading")).toHaveText("Chorus");
		await page.evaluate(() => {
			const el = document.querySelector("#inline") as HTMLElement & { theme: string };
			el.theme = "dark";
		});
		await expect(page.locator("#inline .bm-chart")).toHaveAttribute("data-theme", "dark");
	});

	test("registers the font once however many charts there are", async ({ page }) => {
		await page.goto("/element");
		await expect(page.locator("#remote .bm-title")).toHaveText("Example Song");
		expect(await page.locator("style[data-barmark-font]").count()).toBe(1);
	});
});

test.describe("accessibility", () => {
	test("a screen reader hears sections and bars as music", async ({ page }) => {
		await page.goto("/chart");
		const snapshot = await page.locator("barmark-chart").ariaSnapshot();
		expect(snapshot).toContain("Verse");
		expect(snapshot).toContain("bar 9: D");
		expect(snapshot).toContain("bar 22: A seven sus four, hold, A seven, hold");
		expect(snapshot).not.toContain("sup");
	});

	test("two charts on one page share no ids", async ({ page }) => {
		await page.goto("/chart?count=2");
		const ids = await page.evaluate(() =>
			[...document.querySelectorAll("barmark-chart")].flatMap((el) =>
				[...(el.shadowRoot?.querySelectorAll("[id]") ?? [])].map((e) => e.id),
			),
		);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
