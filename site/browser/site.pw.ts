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
		await expect.poll(() => visible(page)).toEqual(["repeat-line", "repeat-signs", "open-repeat"]);
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
