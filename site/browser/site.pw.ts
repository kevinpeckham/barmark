import { expect, type Page, test } from "@playwright/test";

/** The text inside the first rendered chart's shadow root on the page. */
const chartText = (page: Page, scope = "main") =>
	page.evaluate(
		(selector) =>
			document.querySelector(`${selector} barmark-chart`)?.shadowRoot?.textContent ?? "",
		scope,
	);

const watchErrors = (page: Page) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (m) => {
		if (m.type() === "error") errors.push(m.text());
	});
	return errors;
};

test.describe("home: the live editor", () => {
	test("typing in the source re-renders the chart", async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto("/");
		const source = page.getByRole("textbox", { name: "barmark source of the chart" });
		await source.press("ControlOrMeta+End");
		await source.pressSequentially("\n| Ebm7 |");
		await expect.poll(() => chartText(page), { timeout: 1000 }).toContain("E♭m");
		expect(errors).toEqual([]);
	});

	test("an empty source is an empty chart, without errors", async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto("/");
		await page.getByRole("textbox", { name: "barmark source of the chart" }).fill("");
		await expect.poll(() => chartText(page)).not.toContain("Peaceful Dreams");
		expect(errors).toEqual([]);
	});

	test("markup in the source is shown as text, never run", async ({ page }) => {
		let dialog = false;
		page.on("dialog", (d) => {
			dialog = true;
			void d.dismiss();
		});
		await page.goto("/");
		await page
			.getByRole("textbox", { name: "barmark source of the chart" })
			.fill("# <script>alert(1)</script><img src=x onerror=alert(2)>\n| D |");
		await expect.poll(() => chartText(page)).toContain("<script>alert(1)</script>");
		expect(dialog).toBe(false);
	});

	test("typing stays responsive in a 2,000-line chart", async ({ page }) => {
		await page.goto("/");
		const source = page.getByRole("textbox", { name: "barmark source of the chart" });
		await source.fill("| D | G |\n".repeat(2000));
		await source.press("ControlOrMeta+End");
		const start = Date.now();
		await source.pressSequentially("| Em |");
		expect(Date.now() - start).toBeLessThan(1500);
		await expect
			.poll(
				() =>
					page.evaluate(() =>
						document.querySelector("main barmark-chart")?.shadowRoot?.textContent?.includes("Em"),
					),
				{
					timeout: 5000,
				},
			)
			.toBe(true);
	});

	test("a 1 MB paste is not rendered, and the page stays responsive", async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto("/");
		const source = page.getByRole("textbox", { name: "barmark source of the chart" });
		const start = Date.now();
		// Playwright's fill inserts text like typing and takes minutes for 1 MB;
		// a paste lands as one value change and one input event.
		await source.evaluate((el: HTMLTextAreaElement) => {
			el.value = "| D | G |\n".repeat(100_000);
			el.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await expect(page.getByText(/Too long to preview here: 1,000,000 characters/)).toBeVisible();
		expect(Date.now() - start).toBeLessThan(3000);
		await source.fill("| Em |");
		await expect(page.getByText(/Too long to preview/)).toBeHidden();
		await expect.poll(() => chartText(page)).toContain("Em");
		expect(errors).toEqual([]);
	});

	test("Reset restores the demo", async ({ page }) => {
		await page.goto("/");
		const source = page.getByRole("textbox", { name: "barmark source of the chart" });
		await source.fill("| D |");
		await page.getByRole("button", { name: "Reset" }).click();
		await expect(source).toHaveValue(/# Peaceful Dreams/);
		await expect.poll(() => chartText(page)).toContain("Peaceful Dreams");
	});
});

test.describe("the guide", () => {
	const visible = (page: Page) =>
		page.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>("[data-row]")]
				.filter((r) => !r.hidden)
				.map((r) => r.dataset.row),
		);
	const unrendered = (page: Page) =>
		page.evaluate(
			() =>
				[...document.querySelectorAll<HTMLElement>("[data-row]")].filter(
					(r) => !r.querySelector("barmark-chart")?.shadowRoot?.textContent?.trim(),
				).length,
		);

	test("a shared link opens filtered; clearing it brings every row back, rendered", async ({
		page,
	}) => {
		await page.goto("/syntax?q=repeat&cat=repeats");
		await expect
			.poll(() => visible(page))
			.toEqual(["repeat-line", "repeat-signs", "open-repeat", "endings"]);
		await page.getByRole("searchbox", { name: "Search" }).fill("");
		await page.getByRole("button", { name: "All" }).click();
		await expect(page).toHaveURL(/\/syntax$/);
		expect((await visible(page)).length).toBeGreaterThan(30);
		expect(await unrendered(page)).toBe(0);
	});

	test("typing filters and keeps the query in the URL", async ({ page }) => {
		await page.goto("/syntax");
		await page.getByRole("searchbox", { name: "Search" }).fill("sus4");
		await expect(page).toHaveURL(/\?q=sus4$/);
		expect(await visible(page)).toContain("chord");
	});

	test("an unknown category is ignored", async ({ page }) => {
		await page.goto("/syntax?cat=nope");
		expect((await visible(page)).length).toBeGreaterThan(30);
	});

	test("sorting moves rows and keeps every example rendered", async ({ page }) => {
		await page.goto("/syntax");
		const sort = page.getByRole("combobox", { name: "Sort" });
		await sort.selectOption("name");
		await expect(page).toHaveURL(/sort=name/);
		await sort.selectOption("category");
		expect(await unrendered(page)).toBe(0);
	});
});

test.describe("navigating inside the site", () => {
	const unrendered = (page: Page) =>
		page.evaluate(
			() =>
				[...document.querySelectorAll("main barmark-chart")].filter(
					(c) => !c.shadowRoot?.textContent?.trim(),
				).length,
		);

	test("Read the syntax shows every example rendered", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("link", { name: "Read the syntax" }).click();
		await expect(page).toHaveURL(/\/syntax$/);
		await expect.poll(() => page.locator("main barmark-chart").count()).toBeGreaterThan(30);
		expect(await unrendered(page)).toBe(0);
	});

	test("coming back home shows the demo rendered", async ({ page }) => {
		await page.goto("/syntax");
		await page.getByRole("link", { name: "barmark", exact: true }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect.poll(() => chartText(page)).toContain("Peaceful Dreams");
	});
});

test.describe("in a browser without setHTMLUnsafe", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			// Chrome before 124, Safari before 17.4, Firefox before 133.
			delete (Element.prototype as { setHTMLUnsafe?: unknown }).setHTMLUnsafe;
		});
	});

	test("typing still re-renders the chart", async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto("/");
		const source = page.getByRole("textbox", { name: "barmark source of the chart" });
		await source.press("ControlOrMeta+End");
		await source.pressSequentially("\n| Ebm7 |");
		await expect.poll(() => chartText(page)).toContain("E♭m");
		expect(errors).toEqual([]);
	});

	test("Read the syntax still shows every example rendered", async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto("/");
		await page.getByRole("link", { name: "Read the syntax" }).click();
		await expect(page).toHaveURL(/\/syntax$/);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						[...document.querySelectorAll("main barmark-chart")].filter(
							(c) => !c.shadowRoot?.textContent?.trim(),
						).length,
				),
			)
			.toBe(0);
		expect(errors).toEqual([]);
	});
});

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("the home page shows the rendered demo", async ({ page }) => {
		await page.goto("/");
		expect(await chartText(page)).toContain("Peaceful Dreams");
	});

	test("the guide shows every row, whatever the link says", async ({ page }) => {
		await page.goto("/syntax?q=repeat&cat=repeats");
		const rows = page.locator("[data-row]");
		expect(await rows.count()).toBeGreaterThan(30);
		await expect(page.locator("[data-row][hidden]")).toHaveCount(0);
	});
});

test.describe("on a phone", () => {
	test.use({ viewport: { width: 360, height: 800 } });

	for (const path of ["/", "/syntax"])
		test(`${path} never scrolls sideways`, async ({ page }) => {
			await page.goto(path);
			const [scroll, client] = await page.evaluate(() => [
				document.documentElement.scrollWidth,
				document.documentElement.clientWidth,
			]);
			expect(scroll).toBeLessThanOrEqual(client);
		});
});

test("the source editor shows keyboard focus", async ({ page }) => {
	await page.goto("/");
	const source = page.getByRole("textbox", { name: "barmark source of the chart" });
	await source.focus();
	await page.keyboard.press("Shift+Tab");
	await page.keyboard.press("Tab");
	await expect(source).toBeFocused();
	const outline = await source.evaluate((el) => getComputedStyle(el).outlineStyle);
	expect(outline).not.toBe("none");
});

test("the guide's controls meet WCAG contrast on the dark ground", async ({ page }) => {
	await page.goto("/syntax");
	const ratios = await page.evaluate(() => {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("no canvas");
		const ground = getComputedStyle(document.body).backgroundColor;
		// The colour as painted over the ground, in sRGB.
		const paint = (color: string) => {
			ctx.fillStyle = ground;
			ctx.fillRect(0, 0, 1, 1);
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, 1, 1);
			return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
		};
		const luminance = (rgb: number[]) => {
			const [r, g, b] = rgb.map((v) => {
				const c = v / 255;
				return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
		};
		const ratio = (color: string) => {
			const [a, b] = [luminance(paint(color)), luminance(paint(ground))].sort((x, y) => y - x);
			return ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05);
		};
		const input = document.querySelector("#guide-search") as HTMLElement;
		const chip = document.querySelector('[data-chip="bars"]') as HTMLElement;
		return {
			searchBorder: ratio(getComputedStyle(input.parentElement as HTMLElement).borderTopColor),
			chipBorder: ratio(getComputedStyle(chip).borderTopColor),
			placeholder: ratio(getComputedStyle(input, "::placeholder").color),
		};
	});
	expect(ratios.searchBorder).toBeGreaterThanOrEqual(3);
	expect(ratios.chipBorder).toBeGreaterThanOrEqual(3);
	expect(ratios.placeholder).toBeGreaterThanOrEqual(4.5);
});

test("every input has a name and every link has text", async ({ page }) => {
	for (const path of ["/", "/syntax"]) {
		await page.goto(path);
		const unnamed = await page.evaluate(() => {
			const bad: string[] = [];
			for (const el of document.querySelectorAll("input, textarea, select")) {
				const id = el.getAttribute("id");
				if (!(id && document.querySelector(`label[for="${id}"]`)) && !el.getAttribute("aria-label"))
					bad.push(el.outerHTML.slice(0, 60));
			}
			for (const a of document.querySelectorAll("a"))
				if (!a.textContent?.trim() && !a.getAttribute("aria-label"))
					bad.push(a.outerHTML.slice(0, 60));
			return bad;
		});
		expect(unnamed, path).toEqual([]);
	}
});
