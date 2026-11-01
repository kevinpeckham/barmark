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
		for (const [chart, what] of [
			["long", "a long row"],
			["busy", "a busy bar"],
		] as const)
			test(`${what} wraps on ${name} without scrolling sideways`, async ({ page }) => {
				await page.setViewportSize({ width, height: 800 });
				await page.goto(
					`/chart?chart=${chart}&css=${encodeURIComponent(`body{margin:0}barmark-chart{margin:0}${css}`)}`,
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

	test("fetches its src once, however many attributes it has", async ({ page }) => {
		let fetches = 0;
		page.on("request", (r) => {
			if (r.url().endsWith("/example.chart.md")) fetches++;
		});
		await page.goto("/element");
		await expect(page.locator("#remote .bm-title")).toHaveText("Example Song");
		await page.evaluate(() => {
			const el = document.querySelector("#remote") as HTMLElement & { theme: string };
			el.theme = "dark";
		});
		await expect(page.locator("#remote .bm-chart")).toHaveAttribute("data-theme", "dark");
		expect(fetches).toBe(1);
	});

	test("a server-rendered chart follows its attributes", async ({ page }) => {
		await page.goto("/element");
		await page.evaluate(() => {
			const el = document.querySelector("#server") as HTMLElement & {
				theme: string;
				barNumbers: boolean;
			};
			el.theme = "dark";
			el.barNumbers = false;
		});
		await expect(page.locator("#server .bm-chart")).toHaveAttribute("data-theme", "dark");
		await expect(page.locator("#server .bm-chart")).toHaveAttribute("data-bar-numbers", "off");
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

test.describe("layout", () => {
	/** Every measurement the layout tests need, in one pass over the chart. */
	const measure = (page: Page) =>
		inChart(page, (root) => {
			const all = (sel: string) => [...root.querySelectorAll(sel)] as HTMLElement[];
			const one = (sel: string) => root.querySelector(sel) as HTMLElement;
			const left = (el: Element) => el.getBoundingClientRect().left;
			// A zero-height inline-block sits on its parent's baseline.
			const baseline = (el: Element) => {
				const probe = document.createElement("span");
				probe.style.cssText = "display:inline-block;width:0;height:0";
				el.append(probe);
				const y = probe.getBoundingClientRect().top;
				probe.remove();
				return y;
			};
			const firstBar = (row: Element) => row.querySelector(".bm-bar") as HTMLElement;
			const rows = all(".bm-row");
			const ringRow = one(".bm-ring").closest(".bm-row") as HTMLElement;
			const sus = all(".bm-chord").find((c) => c.textContent?.includes("sus")) as HTMLElement;
			return {
				edge: left(one(".bm-title")),
				barline: left(firstBar(rows[0] as Element)),
				numberLefts: all(".bm-bar-number")
					.filter((n) => n.textContent)
					.map(left),
				numberDrift: rows
					.filter(
						(r) => r.querySelector(".bm-bar-number")?.textContent && r.querySelector(".bm-chord"),
					)
					.map(
						(r) =>
							baseline(r.querySelector(".bm-bar-number") as Element) -
							baseline(r.querySelector(".bm-chord") as Element),
					),
				indented: all(".bm-heading, .bm-text, .bm-directive").map(left),
				atEdge: all(".bm-title, .bm-meta, .bm-diagnostics").map(left),
				ringDrift: baseline(one(".bm-ring")) - baseline(sus),
				ringBesideSus: ringRow.contains(sus),
				chordInset: all(".bm-bar")
					.filter(
						(b) => b.querySelectorAll(".bm-chord").length === 1 && !b.querySelector(".bm-meter"),
					)
					.map((b) => left(b.querySelector(".bm-chord") as Element) - left(b)),
				barWidths: all(".bm-bar").map((b) => b.getBoundingClientRect().width),
				susWidth: (() => {
					const bar = sus.closest(".bm-bar") as HTMLElement;
					const clone = bar.cloneNode(true) as HTMLElement;
					clone.style.cssText = "position:absolute;width:max-content;min-width:0";
					one(".bm-chart").append(clone);
					const w = clone.getBoundingClientRect().width;
					clone.remove();
					return w;
				})(),
				base: Number.parseFloat(getComputedStyle(sus).fontSize),
			};
		});

	test("bar numbers sit flush left, on their row's chord baseline", async ({ page }) => {
		await page.goto("/chart?chart=layout");
		const m = await measure(page);
		for (const x of m.numberLefts) expect(Math.abs(x - m.edge)).toBeLessThanOrEqual(1);
		for (const drift of m.numberDrift) expect(Math.abs(drift)).toBeLessThanOrEqual(1);
	});

	test("headings, lyrics, notes and directives start at the first barline; the title, meta and diagnostics at the edge", async ({
		page,
	}) => {
		await page.goto("/chart?chart=layout&diagnostics");
		const m = await measure(page);
		expect(m.barline - m.edge).toBeGreaterThan(m.base);
		for (const x of m.indented) expect(Math.abs(x - m.barline)).toBeLessThanOrEqual(1);
		for (const x of m.atEdge) expect(Math.abs(x - m.edge)).toBeLessThanOrEqual(1);
	});

	test("without bar numbers nothing is indented", async ({ page }) => {
		await page.goto("/chart?chart=layout&numbers=off");
		const m = await measure(page);
		for (const x of [m.barline, ...m.indented]) expect(Math.abs(x - m.edge)).toBeLessThanOrEqual(1);
	});

	test("a ringed note sits on the chord baseline", async ({ page }) => {
		await page.goto("/chart?chart=layout");
		const m = await measure(page);
		expect(m.ringBesideSus).toBe(true);
		expect(Math.abs(m.ringDrift)).toBeLessThanOrEqual(0.5);
	});

	test("a lone chord starts at the left of its bar, and no bar is narrower than a D7sus4 bar", async ({
		page,
	}) => {
		await page.goto("/chart?chart=layout");
		const m = await measure(page);
		for (const inset of m.chordInset) expect(inset).toBeLessThan(m.base);
		for (const w of m.barWidths) expect(w).toBeGreaterThanOrEqual(m.susWidth - 1);
	});

	for (const width of [1280, 640])
		test(`a triplet group and a note set stay on one line when there is room (${width}px)`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto("/chart?chart=layout");
			const lines = await inChart(page, (root) =>
				[".bm-group", ".bm-notes"].map((sel) => {
					const tops = [...(root.querySelector(sel) as Element).children]
						.filter((c) => !c.matches(".bm-tuplet"))
						.map((c) => Math.round(c.getBoundingClientRect().top));
					return new Set(tops).size;
				}),
			);
			expect(lines).toEqual([1, 1]);
		});

	test("at the default size chords are 16px and no label is under 12px", async ({ page }) => {
		await page.goto("/chart?chart=layout&diagnostics");
		const sizes = await inChart(page, (root) =>
			[
				".bm-title",
				".bm-meta",
				".bm-directive",
				".bm-heading",
				".bm-text",
				".bm-note",
				".bm-chord",
				".bm-chord sup",
				".bm-nc",
				".bm-ring",
				".bm-notes",
				".bm-tuplet",
				".bm-meter",
				".bm-cut",
				".bm-times",
				".bm-bar-number",
				".bm-diagnostics",
			].map((sel) => {
				const el = root.querySelector(sel);
				return [sel, el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0] as const;
			}),
		);
		expect(Object.fromEntries(sizes)[".bm-chord"]).toBe(16);
		for (const [sel, px] of sizes) expect(px, sel).toBeGreaterThanOrEqual(12);
	});

	test("a note line is a true italic at weight 400, not a faked bold", async ({ page }) => {
		await page.goto("/chart?chart=layout");
		const style = await inChart(page, (root) => {
			const s = getComputedStyle(root.querySelector(".bm-note") as Element);
			return `${s.fontStyle} ${s.fontWeight}`;
		});
		expect(style).toBe("italic 400");
	});

	test("the page can colour directives and note lines and set the text and label fonts", async ({
		page,
	}) => {
		const css =
			'barmark-chart{--barmark-directive:#123456;--barmark-note:#654321;--barmark-text-font:"Text Test",serif;--barmark-label-font:"Label Test",sans-serif}';
		await page.goto(`/chart?chart=layout&css=${encodeURIComponent(css)}`);
		const got = await inChart(page, (root) => {
			const s = (sel: string) => getComputedStyle(root.querySelector(sel) as Element);
			return {
				directive: s(".bm-directive").color,
				note: s(".bm-note").color,
				lyric: s(".bm-text:not(.bm-note)").fontFamily,
				labels: [".bm-meta", ".bm-directive", ".bm-heading"].map((sel) => s(sel).fontFamily),
			};
		});
		expect(got.directive).toBe("rgb(18, 52, 86)");
		expect(got.note).toBe("rgb(101, 67, 33)");
		expect(got.lyric).toContain("Text Test");
		for (const f of got.labels) expect(f).toContain("Label Test");
	});
});
