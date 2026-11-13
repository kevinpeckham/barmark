import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { EXAMPLES } from "../src/lib/examples.ts";

/** The text inside the first rendered chart's shadow root on the page. */
const chartText = (page: Page, scope = "main") =>
	page.evaluate(
		(selector) =>
			document.querySelector(`${selector} :is(barmark-chart, barmark-score)`)?.shadowRoot
				?.textContent ?? "",
		scope,
	);

/** The score's SVG text in the first <barmark-score> under `scope`, "" until one is drawn. */
const scoreText = (page: Page, scope = "main") =>
	page.evaluate(
		(selector) =>
			document
				.querySelector(`${selector} barmark-score`)
				?.shadowRoot?.querySelector(".bms-score svg")?.textContent ?? "",
		scope,
	);

/** The chord symbols the score's SVG draws, in order. */
const scoreChords = (page: Page) =>
	page.evaluate(() =>
		[
			...(document
				.querySelector("main barmark-score")
				?.shadowRoot?.querySelectorAll(".bms-score g.harm") ?? []),
		].map((g) => g.textContent?.replace(/\s+/g, "") ?? ""),
	);

/** The chord names the grid draws, in order. */
const gridChords = (page: Page) =>
	page.evaluate(() =>
		[
			...(document
				.querySelector("main :is(barmark-chart, barmark-score)")
				?.shadowRoot?.querySelectorAll(".bm-chord") ?? []),
		].map((c) => c.textContent ?? ""),
	);

/**
 * Each guitar diagram's spoken label in the first chart under `scope`, in the
 * strip's order; null while the chart has no strip.
 */
const diagramLabels = (page: Page, scope = "main") =>
	page.evaluate((selector) => {
		const strip = document
			.querySelector(`${selector} :is(barmark-chart, barmark-score)`)
			?.shadowRoot?.querySelector(".bm-diagrams");
		return strip
			? [...strip.querySelectorAll(".bm-diagram [role=img]")].map(
					(d) => d.getAttribute("aria-label") ?? "",
				)
			: null;
	}, scope);

/** CSS colours as sRGB bytes [r, g, b, a], whatever form the browser writes them in (rgb, oklab, color()). */
const toRgba = (page: Page, colors: string[]) =>
	page.evaluate((list) => {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("no 2d canvas");
		return list.map((color) => {
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, 1, 1);
			return [...ctx.getImageData(0, 0, 1, 1).data];
		});
	}, colors);

/** Waits until the page's script has run: the key menu opens only then. */
const hydrated = async (page: Page) => {
	const key = page.getByRole("button", { name: /^Key: / });
	await expect(async () => {
		await key.click();
		await expect(key).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
	}).toPass({ timeout: 15_000 });
	await page.keyboard.press("Escape");
	await expect(key).toHaveAttribute("aria-expanded", "false");
};

/**
 * Holds back the built chunk that defines <barmark-score>, as a slow
 * connection would, until the returned function releases it.
 */
async function holdScoreElement(page: Page): Promise<() => void> {
	const dir = fileURLToPath(
		new URL("../.vercel/output/static/_app/immutable/chunks", import.meta.url),
	);
	const file = readdirSync(dir).find((f) =>
		/customElements\.define\([`'"]barmark-score/.test(readFileSync(join(dir, f), "utf8")),
	);
	if (!file) throw new Error("no built chunk defines <barmark-score>");
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(`**/_app/immutable/chunks/${file}`, async (route) => {
		await held;
		await route.continue();
	});
	return release;
}

/** Once the held element has arrived and upgraded, gives every waiting callback time to run. */
const settledElement = async (page: Page) => {
	await page.waitForFunction(() => customElements.get("barmark-score") !== undefined);
	await page.waitForTimeout(500);
};

/** Presses Score in the first chart's switch, repeated until the element has upgraded and shows it. */
const pressScore = (page: Page, scope = "main") =>
	expect(async () => {
		await page
			.locator(`${scope} barmark-score`)
			.first()
			.getByRole("radio", { name: "Score" })
			.click();
		await expect.poll(() => scoreText(page, scope), { timeout: 15_000 }).not.toBe("");
	}).toPass({ timeout: 40_000 });

const watchErrors = (page: Page) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (m) => {
		if (m.type() === "error") errors.push(m.text());
	});
	return errors;
};

/**
 * Prerendered controls exist before the page's script runs; an action taken
 * that early never reaches the URL. Repeat it until the URL follows (it
 * failed on CI that way once: FINDINGS.md).
 */
const untilUrl = (page: Page, action: () => Promise<void>, url: RegExp) =>
	expect(async () => {
		await action();
		await expect(page).toHaveURL(url, { timeout: 1_000 });
	}).toPass({ timeout: 15_000 });

// Vercel serves the Analytics and Speed Insights scripts on its own
// deployments; the local preview has neither, so the tests answer them with
// empty ones.
test.beforeEach(async ({ page }) => {
	for (const path of ["**/_vercel/insights/**", "**/_vercel/speed-insights/**"])
		await page.route(path, (route) =>
			route.fulfill({ status: 200, contentType: "text/javascript", body: "" }),
		);
});

test.describe("home: the live editor", () => {
	test("typing in the source re-renders the chart", async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto("/");
		const source = page.getByRole("textbox", { name: "Barmark source of the chart" });
		await source.press("ControlOrMeta+End");
		await source.pressSequentially("\n| Ebm7 |");
		await expect.poll(() => chartText(page), { timeout: 1000 }).toContain("E♭m");
		expect(errors).toEqual([]);
	});

	test("an empty source is an empty chart, without errors", async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto("/");
		await page.getByRole("textbox", { name: "Barmark source of the chart" }).fill("");
		await expect.poll(() => chartText(page)).not.toContain("Amazing Grace");
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
			.getByRole("textbox", { name: "Barmark source of the chart" })
			.fill("# <script>alert(1)</script><img src=x onerror=alert(2)>\n| D |");
		await expect.poll(() => chartText(page)).toContain("<script>alert(1)</script>");
		expect(dialog).toBe(false);
	});

	test("typing stays responsive in a 2,000-line chart", async ({ page }) => {
		await page.goto("/");
		const source = page.getByRole("textbox", { name: "Barmark source of the chart" });
		await source.fill("| D | G |\n".repeat(2000));
		await source.press("ControlOrMeta+End");
		const start = Date.now();
		await source.pressSequentially("| Em |");
		expect(Date.now() - start).toBeLessThan(1500);
		await expect
			.poll(
				() =>
					page.evaluate(() =>
						document
							.querySelector("main :is(barmark-chart, barmark-score)")
							?.shadowRoot?.textContent?.includes("Em"),
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
		const source = page.getByRole("textbox", { name: "Barmark source of the chart" });
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

	test("the chord spelling redraws the chart as numerals and back", async ({ page }) => {
		const errors = watchErrors(page);
		/** The numbered chords in the rendered chart, by their data-numeral. */
		const numerals = () =>
			page.evaluate(() => [
				...new Set(
					[
						...(document
							.querySelector("main :is(barmark-chart, barmark-score)")
							?.shadowRoot?.querySelectorAll("[data-numeral]") ?? []),
					].map((el) => el.getAttribute("data-numeral")),
				),
			]);
		await page.goto("/");
		const spelling = page.getByRole("radiogroup", { name: "Chord spelling" });
		await expect(spelling.getByRole("radio", { name: "Names" })).toBeChecked();
		expect(await numerals()).toEqual([]);
		// A choice made before the page's script runs is lost: repeat it until the chart redraws.
		await expect(async () => {
			await spelling.getByRole("radio", { name: "Nashville" }).check();
			await expect.poll(numerals, { timeout: 1_000 }).toEqual(["nashville"]);
		}).toPass({ timeout: 15_000 });
		await spelling.getByRole("radio", { name: "Roman" }).check();
		await expect.poll(numerals).toEqual(["roman"]);
		// Editing keeps the spelling.
		const source = page.getByRole("textbox", { name: "Barmark source of the chart" });
		await source.press("ControlOrMeta+End");
		await source.pressSequentially("\n| Bm7 |");
		await expect.poll(() => chartText(page)).toContain("vi");
		expect(await numerals()).toEqual(["roman"]);
		await spelling.getByRole("radio", { name: "Names" }).check();
		await expect.poll(numerals).toEqual([]);
		await expect.poll(() => chartText(page)).toContain("Bm");
		expect(errors).toEqual([]);
	});

	test("Reset restores the demo", async ({ page }) => {
		await page.goto("/");
		const source = page.getByRole("textbox", { name: "Barmark source of the chart" });
		await source.fill("| D |");
		await page.getByRole("button", { name: "Reset" }).click();
		await expect(source).toHaveValue(/# Amazing Grace/);
		await expect.poll(() => chartText(page)).toContain("Amazing Grace");
	});
});

test.describe("home: the examples", () => {
	const source = (page: Page) => page.getByRole("textbox", { name: "Barmark source of the chart" });
	const examples = (page: Page) => page.getByRole("group", { name: "Examples" });
	const position = (page: Page) => examples(page).getByRole("status");
	/** Presses Next (or Previous) and waits for the chart to show `title`; repeated until the page's script has run. */
	const flip = (page: Page, to: "Next" | "Previous", title: string) =>
		expect(async () => {
			await examples(page)
				.getByRole("button", { name: `${to} example` })
				.click();
			await expect(position(page)).toContainText(title, { timeout: 1_000 });
		}).toPass({ timeout: 15_000 });
	const titles = EXAMPLES.map((e) => e.title);
	const n = titles.length;
	let errors: string[] = [];
	test.beforeEach(({ page }) => {
		errors = watchErrors(page);
	});
	test.afterEach(() => {
		expect(errors).toEqual([]);
	});

	test("Next and Previous flip through every example, round and back", async ({ page }) => {
		await page.goto("/");
		await expect(position(page)).toHaveText(`Amazing Grace 1 of ${n}`);
		for (const [i, title] of titles.entries()) {
			if (i > 0) await flip(page, "Next", title);
			await expect(position(page)).toHaveText(`${title} ${i + 1} of ${n}`);
			await expect(source(page)).toHaveValue(new RegExp(`^# ${title}\\n`));
			await expect.poll(() => chartText(page)).toContain(title);
		}
		// Past the last comes the first; before the first, the last.
		await flip(page, "Next", "Amazing Grace");
		await flip(page, "Previous", titles[n - 1] ?? "");
		await flip(page, "Previous", titles[n - 2] ?? "");
		await expect.poll(() => chartText(page)).toContain(titles[n - 2] ?? "");
	});

	test("the controls work from the keyboard", async ({ page }) => {
		await page.goto("/");
		const next = examples(page).getByRole("button", { name: "Next example" });
		await expect(async () => {
			await next.focus();
			await page.keyboard.press("Enter");
			await expect(position(page)).toContainText("Greensleeves", { timeout: 1_000 });
		}).toPass({ timeout: 15_000 });
		await page.keyboard.press("Shift+Tab");
		await expect(examples(page).getByRole("button", { name: "Previous example" })).toBeFocused();
		await page.keyboard.press("Space");
		await expect(position(page)).toContainText("Amazing Grace");
	});

	test("arrow keys in the source move its caret, never the example", async ({ page }) => {
		await page.goto("/");
		await flip(page, "Next", "Greensleeves");
		await source(page).focus();
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowLeft");
		await expect(position(page)).toContainText("Greensleeves");
	});

	test("flipping keeps the Score view, and engraves the new example", async ({ page }) => {
		await page.goto("/");
		await pressScore(page);
		const score = page.locator("main barmark-score");
		await flip(page, "Previous", "Peaceful Dreams");
		await expect.poll(() => scoreText(page), { timeout: 15_000 }).toContain("Peaceful Dreams");
		await expect(score.getByRole("radio", { name: "Score" })).toBeChecked();
		// Power chords as the chart spells them, never as "no3".
		const chords = await scoreChords(page);
		expect(chords.slice(0, 2)).toEqual(["D7sus4", "D7sus4"]);
		expect(chords).toContain("G5(7)");
		expect(chords.filter((c) => c.includes("no3"))).toEqual([]);
		await flip(page, "Next", "Amazing Grace");
		await expect.poll(() => scoreText(page), { timeout: 15_000 }).toContain("Amazing Grace");
		await expect(score.getByRole("radio", { name: "Score" })).toBeChecked();
		await score.getByRole("radio", { name: "Grid" }).click();
		await flip(page, "Next", "Greensleeves");
		await expect(score.getByRole("radio", { name: "Grid" })).toBeChecked();
		await expect.poll(() => chartText(page)).toContain("Greensleeves");
	});

	test("flipping keeps the chord spelling, and draws the new example in its own key", async ({
		page,
	}) => {
		await page.goto("/");
		const key = page.getByRole("button", { name: /^Key: / });
		await expect(key).toHaveAccessibleName("Key: G");
		await expect(async () => {
			await key.click();
			await page.getByRole("menuitemradio", { name: "A", exact: true }).click({ timeout: 1_000 });
			await expect(key).toHaveAccessibleName("Key: A", { timeout: 1_000 });
		}).toPass({ timeout: 15_000 });
		const spelling = page.getByRole("radiogroup", { name: "Chord spelling" });
		await spelling.getByRole("radio", { name: "Roman" }).check();
		await flip(page, "Next", "Greensleeves");
		await expect(key).toHaveAccessibleName("Key: Am");
		await expect(spelling.getByRole("radio", { name: "Roman" })).toBeChecked();
	});

	test("flipping keeps the guitar diagrams, drawn for the new example's chords", async ({
		page,
	}) => {
		await page.goto("/");
		const toggle = page.getByRole("button", { name: "Guitar diagrams" });
		await expect(async () => {
			await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
		}).toPass({ timeout: 15_000 });
		await expect.poll(() => diagramLabels(page)).not.toBeNull();
		await flip(page, "Next", "Greensleeves");
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await expect.poll(() => chartText(page)).toContain("Greensleeves");
		await expect.poll(async () => (await diagramLabels(page))?.[0]).toMatch(/^A minor: /);
	});

	test("Reset restores the example on show, not the default", async ({ page }) => {
		await page.goto("/");
		await flip(page, "Next", "Greensleeves");
		await source(page).fill("| D |");
		await page.getByRole("button", { name: "Reset" }).click();
		await expect(source(page)).toHaveValue(/^# Greensleeves\n/);
		await expect(position(page)).toContainText("Greensleeves");
	});

	test("an edit stays with its example across flips, until Reset", async ({ page }) => {
		await page.goto("/");
		await flip(page, "Next", "Greensleeves");
		await source(page).fill("# Greensleeves, edited\n| Am |");
		await flip(page, "Next", "Blues in F");
		await expect(source(page)).toHaveValue(/^# Blues in F\n/);
		await flip(page, "Previous", "Greensleeves");
		await expect(source(page)).toHaveValue("# Greensleeves, edited\n| Am |");
		await expect.poll(() => chartText(page)).toContain("Greensleeves, edited");
		await page.getByRole("button", { name: "Reset" }).click();
		await expect(source(page)).toHaveValue(/^# Greensleeves\ncomposer/);
		// Reset forgets the edit: flipping away and back shows the original.
		await flip(page, "Next", "Blues in F");
		await flip(page, "Previous", "Greensleeves");
		await expect(source(page)).toHaveValue(/^# Greensleeves\ncomposer/);
	});

	test.describe("on a phone", () => {
		test.use({ viewport: { width: 360, height: 800 } });
		/** Whether the page itself scrolls sideways. */
		const scrolls = (page: Page) =>
			page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
			);

		test("no example scrolls the page sideways, as a grid or as a score", async ({ page }) => {
			await page.goto("/");
			for (const [i, title] of titles.entries()) {
				if (i > 0) await flip(page, "Next", title);
				await expect.poll(() => chartText(page)).toContain(title);
				expect([title, "grid", await scrolls(page)]).toEqual([title, "grid", false]);
			}
			await flip(page, "Next", titles[0] ?? "");
			// With the guitar diagrams on, the strip wraps or scrolls inside the window too.
			const toggle = page.getByRole("button", { name: "Guitar diagrams" });
			await toggle.click();
			await expect.poll(() => diagramLabels(page)).not.toBeNull();
			for (const [i, title] of titles.entries()) {
				if (i > 0) await flip(page, "Next", title);
				await expect.poll(() => chartText(page)).toContain(title);
				expect([title, "diagrams", await scrolls(page)]).toEqual([title, "diagrams", false]);
			}
			await flip(page, "Next", titles[0] ?? "");
			await toggle.click();
			await pressScore(page);
			for (const [i, title] of titles.entries()) {
				if (i > 0) await flip(page, "Next", title);
				await expect.poll(() => scoreText(page), { timeout: 15_000 }).toContain(title);
				expect([title, "score", await scrolls(page)]).toEqual([title, "score", false]);
			}
		});
	});
});

test.describe("home: guitar diagrams", () => {
	const toggle = (page: Page) => page.getByRole("button", { name: "Guitar diagrams" });
	let errors: string[] = [];
	test.beforeEach(({ page }) => {
		errors = watchErrors(page);
	});
	test.afterEach(() => {
		expect(errors).toEqual([]);
	});

	test("the switch draws a diagram for each distinct chord, and takes them away again", async ({
		page,
	}) => {
		await page.goto("/");
		await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
		expect(await diagramLabels(page)).toBeNull();
		const chords = new Set(await gridChords(page));
		// A press made before the page's script runs is lost: repeat it until the chart redraws.
		await expect(async () => {
			await toggle(page).click();
			await expect.poll(() => diagramLabels(page), { timeout: 1_000 }).not.toBeNull();
		}).toPass({ timeout: 15_000 });
		await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
		const labels = (await diagramLabels(page)) ?? [];
		expect(labels).toHaveLength(chords.size);
		// In the order the chart first plays them: Amazing Grace opens on its pickup, D.
		expect(labels[0]).toMatch(/^D: /);
		// Editing keeps them, and a new chord gets its own.
		const source = page.getByRole("textbox", { name: "Barmark source of the chart" });
		await source.press("ControlOrMeta+End");
		await source.pressSequentially("\n| F#m7b5 |");
		await expect
			.poll(async () => (await diagramLabels(page))?.at(-1))
			.toMatch(/^F sharp minor seven flat five: /);
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
		await expect.poll(() => diagramLabels(page)).toBeNull();
		await expect.poll(() => chartText(page)).toContain("Amazing Grace");
	});

	test("the diagrams are the grid's: Score sets the switch aside, Grid brings it back", async ({
		page,
	}) => {
		await page.goto("/");
		await pressScore(page);
		await expect(toggle(page)).toBeDisabled();
		// The reason is the button's own, so assistive technology reaches it.
		await expect(toggle(page)).toHaveAttribute("title", /switch to Grid/);
		await page.locator("main barmark-score").getByRole("radio", { name: "Grid" }).click();
		await expect(toggle(page)).not.toHaveAttribute("title");
		await expect(toggle(page)).toBeEnabled();
		await toggle(page).click();
		await expect.poll(() => diagramLabels(page)).not.toBeNull();
	});

	test("the strip wears the site's dark window: light strings and dots on the dark ground", async ({
		page,
	}) => {
		await page.goto("/");
		await expect(async () => {
			await toggle(page).click();
			await expect.poll(() => diagramLabels(page), { timeout: 1_000 }).not.toBeNull();
		}).toPass({ timeout: 15_000 });
		const [dot, ground] = await page.evaluate(() => {
			const el = document
				.querySelector("main barmark-score")
				?.shadowRoot?.querySelector(".bm-dg-dot");
			const window = document.querySelectorAll("main section.device-window")[1];
			return [
				el ? getComputedStyle(el).fill : "",
				window ? getComputedStyle(window).backgroundColor : "",
			];
		});
		const [dotRgba, groundRgba] = await toRgba(page, [dot ?? "", ground ?? ""]);
		// Light on dark: the dots' channels well above the middle, the window's well below, both opaque.
		for (const c of dotRgba?.slice(0, 3) ?? []) expect(c).toBeGreaterThan(160);
		for (const c of groundRgba?.slice(0, 3) ?? []) expect(c).toBeLessThan(60);
		expect([dotRgba?.[3], groundRgba?.[3]]).toEqual([255, 255]);
	});

	test("on, then off, before the element arrives: the latest press wins", async ({ page }) => {
		const release = await holdScoreElement(page);
		await page.goto("/");
		await hydrated(page);
		await toggle(page).click();
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
		release();
		await settledElement(page);
		await expect(page.locator("main barmark-score")).not.toHaveAttribute("chord-diagrams");
		expect(await diagramLabels(page)).toBeNull();
	});

	test("Nashville, then Roman, before the element arrives: the chart ends on Roman", async ({
		page,
	}) => {
		const release = await holdScoreElement(page);
		await page.goto("/");
		await hydrated(page);
		const spelling = page.getByRole("radiogroup", { name: "Chord spelling" });
		await spelling.getByRole("radio", { name: "Nashville" }).check();
		await spelling.getByRole("radio", { name: "Roman" }).check();
		release();
		await settledElement(page);
		await expect(page.locator("main barmark-score")).toHaveAttribute("numerals", "roman");
		const numerals = await page.evaluate(() => [
			...new Set(
				[
					...(document
						.querySelector("main barmark-score")
						?.shadowRoot?.querySelectorAll("[data-numeral]") ?? []),
				].map((el) => el.getAttribute("data-numeral")),
			),
		]);
		expect(numerals).toEqual(["roman"]);
	});

	test("the keyboard's focus ring shows on the switch, on, and on the checked spelling", async ({
		page,
	}) => {
		await page.goto("/");
		await hydrated(page);
		/** The focused control's outline against what it sits on: visible if offset outside, or another colour. */
		const ringShows = async (el: import("@playwright/test").Locator, box = el) => {
			expect(await el.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
			const ring = await box.evaluate((e) => {
				const s = getComputedStyle(e);
				return [s.outlineStyle, s.outlineOffset, s.outlineColor, s.backgroundColor];
			});
			const [style, offset, color, bg] = ring as [string, string, string, string];
			expect(style).not.toBe("none");
			const [c, b] = await toRgba(page, [color, bg]);
			return Number.parseFloat(offset) > 0 || JSON.stringify(c) !== JSON.stringify(b);
		};
		await toggle(page).focus();
		await page.keyboard.press("Space");
		await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
		expect(await ringShows(toggle(page))).toBe(true);
		const names = page
			.getByRole("radiogroup", { name: "Chord spelling" })
			.getByRole("radio", { name: "Names" });
		await expect(names).toBeChecked();
		await names.focus();
		expect(await ringShows(names, names.locator("xpath=.."))).toBe(true);
	});

	test.describe("on a phone", () => {
		test.use({ viewport: { width: 390, height: 800 } });
		test("the switch wraps with the other controls, and the strip never scrolls the page", async ({
			page,
		}) => {
			await page.goto("/");
			await expect(async () => {
				await toggle(page).click();
				await expect.poll(() => diagramLabels(page), { timeout: 1_000 }).not.toBeNull();
			}).toPass({ timeout: 15_000 });
			const [scroll, client] = await page.evaluate(() => [
				document.documentElement.scrollWidth,
				document.documentElement.clientWidth,
			]);
			expect(scroll).toBeLessThanOrEqual(client);
			const box = await toggle(page).boundingBox();
			expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(client);
		});
	});
});

test.describe("the switch's focus ring stays inside its window", () => {
	for (const width of [1280, 390])
		for (const path of ["/", `/try?q=${encodeURIComponent("| D | A |")}`])
			test(`${path.split("?")[0]} at ${width} wide`, async ({ page }) => {
				await page.setViewportSize({ width, height: 900 });
				await page.goto(path);
				const toggle = page.getByRole("button", { name: "Guitar diagrams" });
				await expect(toggle).toBeVisible();
				await toggle.focus();
				const [ring, bar, win] = await toggle.evaluate((el) => {
					const s = getComputedStyle(el);
					const reach = Number.parseFloat(s.outlineOffset) + Number.parseFloat(s.outlineWidth);
					const r = el.getBoundingClientRect();
					const header = el.closest("header")?.getBoundingClientRect();
					const section = el.closest("section")?.getBoundingClientRect();
					const box = (b?: DOMRect) => (b ? [b.left, b.top, b.right, b.bottom] : []);
					return [
						[r.left - reach, r.top - reach, r.right + reach, r.bottom + reach],
						box(header),
						box(section),
					];
				});
				const [l, t, r, b] = ring as number[];
				for (const outer of [bar, win] as number[][]) {
					expect(l).toBeGreaterThanOrEqual(outer[0] ?? 0);
					expect(t).toBeGreaterThanOrEqual(outer[1] ?? 0);
					expect(r).toBeLessThanOrEqual(outer[2] ?? 0);
					expect(b).toBeLessThanOrEqual(outer[3] ?? 0);
				}
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
			.toEqual([
				"repeat-line",
				"repeat-signs",
				"open-repeat",
				"endings",
				"segno",
				"d-s",
				"d-c",
				"fine",
				"to-coda",
				"coda",
				"jump",
			]);
		await page.getByRole("searchbox", { name: "Search" }).fill("");
		await page.getByRole("button", { name: "All" }).click();
		await expect(page).toHaveURL(/\/syntax$/);
		expect((await visible(page)).length).toBeGreaterThan(30);
		expect(await unrendered(page)).toBe(0);
	});

	test("typing filters and keeps the query in the URL", async ({ page }) => {
		await page.goto("/syntax");
		const search = page.getByRole("searchbox", { name: "Search" });
		await untilUrl(page, () => search.fill("sus4"), /\?q=sus4$/);
		expect(await visible(page)).toContain("chord");
	});

	test("an unknown category is ignored", async ({ page }) => {
		await page.goto("/syntax?cat=nope");
		expect((await visible(page)).length).toBeGreaterThan(30);
	});

	test("sorting moves rows and keeps every example rendered", async ({ page }) => {
		await page.goto("/syntax");
		const sort = page.getByRole("combobox", { name: "Sort" });
		await untilUrl(page, async () => void (await sort.selectOption("name")), /sort=name/);
		await sort.selectOption("category");
		expect(await unrendered(page)).toBe(0);
	});
});

test.describe("try it", () => {
	const box = (page: Page) => page.getByRole("textbox", { name: "Barmark to read" });
	const reading = (page: Page) => page.locator("[data-reading]");
	let errors: string[] = [];
	test.beforeEach(({ page }) => {
		errors = watchErrors(page);
	});
	test.afterEach(() => {
		expect(errors).toEqual([]);
	});

	test("typing reads at once and keeps the URL", async ({ page }) => {
		await page.goto("/try");
		await untilUrl(page, () => box(page).fill("C7b9/E"), /\/try\?q=C7b9%2FE$/);
		await expect(reading(page)).toContainText("C seven flat nine over E");
	});

	test("a shared link opens with its reading", async ({ page }) => {
		await page.goto("/try?q=key%3A%20D%0A%7C%20D%20%7C%20A%20%7C");
		await expect(box(page)).toHaveValue("key: D\n| D | A |");
		await expect(reading(page).locator("pre")).toContainText("| D | A |");
		await expect.poll(() => chartText(page, "[data-reading]")).toMatch(/bar 1: D.*bar 2: A/);
	});

	test("a shared link never shows the opening example first", async ({ page }) => {
		// Hold the page's script back, as a slow connection would.
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route("**/_app/immutable/**/*.js", async (route) => {
			await held;
			await route.continue();
		});
		await page.goto("/try?q=G7", { waitUntil: "commit" });
		await page.locator("[data-reading]").waitFor({ state: "attached" });
		await expect(reading(page)).toBeHidden();
		release();
		await expect(reading(page)).toContainText("G seven");
		await expect(reading(page)).toBeVisible();
	});

	test("typing writes the URL once it pauses, not on every key", async ({ page }) => {
		await page.addInitScript(() => {
			const replace = history.replaceState.bind(history);
			Object.assign(window, { urlWrites: 0 });
			history.replaceState = (...args) => {
				Object.assign(window, {
					urlWrites: (window as unknown as { urlWrites: number }).urlWrites + 1,
				});
				return replace(...args);
			};
		});
		const writes = () =>
			page.evaluate(() => (window as unknown as { urlWrites: number }).urlWrites);
		await page.goto("/try");
		await untilUrl(page, () => box(page).fill("C"), /q=C$/);
		const before = await writes();
		await box(page).press("End");
		await box(page).pressSequentially("maj7(#11)/E");
		await expect(page).toHaveURL(/q=Cmaj7%28%2311%29%2FE$/);
		expect((await writes()) - before).toBeLessThanOrEqual(2);
	});

	test("a text too long to share stays out of the link, and the page says so", async ({ page }) => {
		await page.goto("/try");
		await untilUrl(page, () => box(page).fill("| D |"), /q=/);
		await box(page).evaluate((el: HTMLTextAreaElement) => {
			el.value = "| C |\n".repeat(400);
			el.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await expect(page).toHaveURL(/\/try$/);
		await expect(page.getByText("Too long to keep in the link")).toBeVisible();
		await box(page).fill("| D |");
		await expect(page).toHaveURL(/q=/);
		await expect(page.getByText("Too long to keep in the link")).toBeHidden();
	});

	test("the suggestion fixes the chord", async ({ page }) => {
		await page.goto("/try");
		await untilUrl(page, () => box(page).fill("H7"), /q=H7$/);
		await page.getByRole("button", { name: "Try B7" }).click();
		await expect(box(page)).toHaveValue("B7");
		// The button goes with the error; the keyboard stays in the box.
		await expect(box(page)).toBeFocused();
		await expect(reading(page)).toContainText("B seven");
	});

	test("chips fill the box", async ({ page }) => {
		await page.goto("/try");
		await untilUrl(
			page,
			() => page.getByRole("button", { name: "{C E G}" }).click(),
			/q=%7BC\+E\+G%7D$/,
		);
		await expect(reading(page)).toContainText("notes C, E, G");
	});

	test("typing in a large chart doesn't wait for each reading", async ({ page }) => {
		await page.goto("/try");
		await expect(box(page)).toHaveValue("Cø");
		await box(page).evaluate((el: HTMLTextAreaElement) => {
			el.value = "| D | G |\n".repeat(4_000);
			el.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await expect(reading(page).locator("pre")).toContainText("| D | G |");
		await box(page).press("End");
		const start = Date.now();
		await box(page).pressSequentially("| A |");
		expect(Date.now() - start).toBeLessThan(1_500);
		await expect(reading(page).locator("pre")).toContainText("| A |");
	});

	test("a chord shows its guitar diagram, with no switch", async ({ page }) => {
		await page.goto("/try");
		await expect
			.poll(() => diagramLabels(page, "[data-reading]"))
			.toEqual(["C minor seven flat five: muted, 3, 4, 3, 4, muted"]);
		await untilUrl(page, () => box(page).fill("F#m7b5"), /q=F%23m7b5$/);
		await expect
			.poll(async () => (await diagramLabels(page, "[data-reading]"))?.[0])
			.toMatch(/^F sharp minor seven flat five: /);
		await box(page).fill("{C3 G3 E4}");
		await expect
			.poll(() => diagramLabels(page, "[data-reading]"))
			.toEqual(["notes C three, G three, E four: muted, 3, muted, open, muted, open"]);
		// One pitch is a note, not a shape: no strip at all.
		await box(page).fill("{E}");
		await expect(reading(page)).toContainText("note E");
		await expect.poll(() => diagramLabels(page, "[data-reading]")).toBeNull();
		await expect(page.getByRole("button", { name: "Guitar diagrams" })).toHaveCount(0);
	});

	test("a chart shows the diagram switch, off, and the switch draws the strip", async ({
		page,
	}) => {
		await page.goto("/try");
		const toggle = page.getByRole("button", { name: "Guitar diagrams" });
		await untilUrl(page, () => page.getByRole("button", { name: "Gtr + Pno" }).click(), /q=part/);
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		expect(await diagramLabels(page, "[data-reading]")).toBeNull();
		await toggle.click();
		await expect
			.poll(() => diagramLabels(page, "[data-reading]"))
			.toEqual([
				"G: 3, 2, open, open, open, 3",
				"C: muted, 3, 2, open, 1, open",
				"D: muted, muted, open, 2, 3, 2",
				"G over B: muted, 2, open, open, open, 3",
				"E minor: open, 2, 2, open, open, open",
			]);
		// Not kept in the link.
		await expect(page).toHaveURL(/^[^#]*\?q=part[^&]*$/);
		await toggle.click();
		await expect.poll(() => diagramLabels(page, "[data-reading]")).toBeNull();
		// A chord takes the switch away.
		await box(page).fill("C");
		await expect(toggle).toHaveCount(0);
	});

	test("a shared link to a chord shows its diagram once the page is ready", async ({ page }) => {
		await page.goto("/try?q=G7alt");
		await expect(reading(page)).toContainText("G seven altered");
		await expect
			.poll(() => diagramLabels(page, "[data-reading]"))
			.toEqual(["G seven altered: 3, 2, 3, muted, muted, muted, altered tones not shown"]);
	});

	test("the window's bar keeps its height whether the reading is a chord or a chart", async ({
		page,
	}) => {
		await page.goto("/try");
		const bar = page
			.locator("section.device-window", {
				has: page.getByRole("heading", { name: "Barmark reads" }),
			})
			.locator("header");
		await untilUrl(page, () => box(page).fill("C"), /q=C$/);
		const chord = (await bar.boundingBox())?.height;
		await box(page).fill("| D | A |");
		await expect(page.getByRole("button", { name: "Guitar diagrams" })).toBeVisible();
		const chart = (await bar.boundingBox())?.height;
		expect(chart).toBe(chord);
	});

	test("a long paste does not freeze the page", async ({ page }) => {
		await page.goto("/try");
		await expect(box(page)).toHaveValue("Cø");
		const start = Date.now();
		// fill() is itself slow on this much text: set it as a paste would.
		await box(page).evaluate((el: HTMLTextAreaElement) => {
			el.value = "| C |\n".repeat(10_000);
			el.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await expect(page.getByText(/Too long to preview here: 60,000 characters/)).toBeVisible();
		expect(Date.now() - start).toBeLessThan(3000);
		await box(page).fill("Cø");
		await expect(reading(page)).toContainText("C minor seven flat five");
	});
});

test.describe("navigating inside the site", () => {
	const unrendered = (page: Page) =>
		page.evaluate(
			() =>
				[...document.querySelectorAll("main :is(barmark-chart, barmark-score)")].filter(
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
		await expect.poll(() => chartText(page)).toContain("Amazing Grace");
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
		const source = page.getByRole("textbox", { name: "Barmark source of the chart" });
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
						[...document.querySelectorAll("main :is(barmark-chart, barmark-score)")].filter(
							(c) => !c.shadowRoot?.textContent?.trim(),
						).length,
				),
			)
			.toBe(0);
		expect(errors).toEqual([]);
	});
});

test("the chart wears the site's look: 15.5px chords, its colours and the Noto fonts", async ({
	page,
}) => {
	await page.goto("/");
	await page
		.getByRole("textbox", { name: "Barmark source of the chart" })
		.fill("# Look\nkey: D\n## Verse\n| D | G |\nWords to sing\n### A note\ntime: 3/4\n| A |");
	await expect.poll(() => chartText(page)).toContain("Words to sing");
	await page.evaluate(() => document.fonts.ready);
	const look = await page.evaluate(() => {
		const root = document.querySelector("main :is(barmark-chart, barmark-score)")
			?.shadowRoot as ShadowRoot;
		const style = (sel: string) => getComputedStyle(root.querySelector(sel) as Element);
		return {
			chord: style(".bm-chord").fontSize,
			ink: style(".bm-chord").color,
			muted: style(".bm-meta").color,
			directive: style(".bm-directive").color,
			note: style(".bm-note").color,
			accent: style(".bm-chart").getPropertyValue("--bm-accent").trim(),
			lyrics: style(".bm-text:not(.bm-note)").fontFamily,
			noteFont: `${style(".bm-note").fontStyle} ${style(".bm-note").fontFamily}`,
			labels: [".bm-meta", ".bm-directive", ".bm-heading"].map((s) => style(s).fontFamily),
			letter: root.querySelector(".bm-rehearsal")?.textContent,
			italic: document.fonts.check('italic 14px "Noto Serif"'),
			upright: [...document.fonts].some(
				(f) => f.family.replaceAll('"', "") === "Noto Serif" && f.style === "normal",
			),
		};
	});
	expect(look.chord).toBe("15.5px");
	expect(look.ink).toBe("rgb(255, 255, 255)");
	expect(look.muted).toBe(look.directive);
	expect(look.muted).toContain("0.8)");
	expect(look.note).toBe("rgb(236, 232, 224)");
	expect(look.accent).toBe("#e8a56a");
	expect(look.lyrics).toContain("Noto Serif");
	expect(look.noteFont).toMatch(/^italic .*Noto Serif/);
	for (const family of look.labels) expect(family).toContain("Noto Sans");
	expect(look.letter).toBe("A");
	expect(look.italic).toBe(true);
	expect(look.upright).toBe(true);
});

test("the editor drives one <barmark-score> element through its text property", async ({
	page,
}) => {
	const errors = watchErrors(page);
	await page.goto("/");
	await page.waitForFunction(() => customElements.get("barmark-score"));
	const chart = await page.evaluateHandle(() => document.querySelector("main barmark-score"));
	await page
		.getByRole("textbox", { name: "Barmark source of the chart" })
		.fill("## Bridge\n| Ebm7 |");
	await expect.poll(() => chartText(page)).toContain("E♭m");
	const same = await chart.evaluate((el) => ({
		connected: el?.isConnected,
		text: (el as HTMLElement & { text: string | null }).text,
		theme: el?.shadowRoot?.querySelector(".bm-chart")?.getAttribute("data-theme"),
	}));
	expect(same).toEqual({ connected: true, text: "## Bridge\n| Ebm7 |", theme: "dark" });
	expect(errors).toEqual([]);
});

test("Edwin is registered once, from one file", async ({ page }) => {
	const files = new Set<string>();
	page.on("request", (r) => {
		if (/Edwin/i.test(r.url())) files.add(new URL(r.url()).pathname);
	});
	await page.goto("/");
	await page.waitForFunction(() => customElements.get("barmark-chart"));
	await page.evaluate(() => document.fonts.ready);
	const faces = await page.evaluate(
		() =>
			[...document.styleSheets]
				.flatMap((sheet) => [...sheet.cssRules])
				.filter((r) => r instanceof CSSFontFaceRule && r.style.fontFamily.includes("barmark Edwin"))
				.length,
	);
	expect(faces).toBe(1);
	expect([...files]).toEqual(["/fonts/Edwin-Roman.otf"]);
});

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("the home page shows the rendered demo", async ({ page }) => {
		await page.goto("/");
		expect(await chartText(page)).toContain("Amazing Grace");
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

	test("the rendered chart keeps four bars' width and scrolls inside its window", async ({
		page,
	}) => {
		await page.goto("/");
		const sizes = await page.evaluate(() => {
			const chart = document.querySelector("main :is(barmark-chart, barmark-score)") as HTMLElement;
			const body = chart.closest(".overflow-x-auto") as HTMLElement;
			const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
			return {
				chart: chart.getBoundingClientRect().width / rem,
				scrolls: body.scrollWidth > body.clientWidth,
			};
		});
		expect(sizes.chart).toBeGreaterThanOrEqual(24);
		expect(sizes.scrolls).toBe(true);
	});

	const WIDE = `?q=${encodeURIComponent("| C | F | G | C | Am | F | G | C |")}`;
	for (const path of ["/", "/syntax", `/try${WIDE}`])
		test(`${path.split("?")[0]} charts keep their rows in columns rather than wrapping them`, async ({
			page,
		}) => {
			await page.goto(path);
			await expect
				.poll(() =>
					page.evaluate(() => [
						...new Set(
							[...document.querySelectorAll("main :is(barmark-chart, barmark-score)")].flatMap(
								(chart) =>
									[...(chart.shadowRoot?.querySelectorAll(".bm-grid") ?? [])].map(
										(g) => getComputedStyle(g).display,
									),
							),
						),
					]),
				)
				.toEqual(["grid"]);
		});

	for (const path of ["/", "/syntax", "/try", "/get-started", "/faq"])
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
	const source = page.getByRole("textbox", { name: "Barmark source of the chart" });
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
	for (const path of ["/", "/syntax", "/try", "/get-started", "/faq"]) {
		await page.goto(path);
		const unnamed = await page.evaluate(() => {
			const bad: string[] = [];
			for (const el of document.querySelectorAll("input, textarea, select")) {
				const id = el.getAttribute("id");
				const labelled =
					(id && document.querySelector(`label[for="${id}"]`)) || el.closest("label");
				if (!labelled?.textContent?.trim() && !el.getAttribute("aria-label"))
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

test("Vercel Analytics and Speed Insights load once each, from the site's own origin", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("link", { name: "FAQ" }).click();
	await expect(page).toHaveURL(/\/faq$/);
	const scripts = await page.evaluate(() =>
		[...document.querySelectorAll("script[src*='insights']")].map((s) => s.getAttribute("src")),
	);
	expect(scripts.toSorted()).toEqual([
		"/_vercel/insights/script.js",
		"/_vercel/speed-insights/script.js",
	]);
});

test("the home page's buttons share one size and one font", async ({ page }) => {
	await page.goto("/");
	const looks = await page.evaluate(() =>
		[...document.querySelectorAll("main a.button-accent-solid, main a.button-outline")].map((a) => {
			const fonts = [a, ...a.querySelectorAll("*")]
				.filter((el) => el.textContent?.trim())
				.map((el) => `${getComputedStyle(el).fontFamily} ${getComputedStyle(el).fontSize}`);
			return JSON.stringify({
				height: Math.round(a.getBoundingClientRect().height),
				radius: getComputedStyle(a).borderRadius,
				fonts: [...new Set(fonts)],
			});
		}),
	);
	expect(looks.length).toBeGreaterThan(1);
	expect(new Set(looks).size, looks.join("\n")).toBe(1);
});

test.describe("the FAQ", () => {
	const questions = (page: Page) => page.getByRole("navigation", { name: "Questions" });

	test("on a wide screen the questions sit beside the answers and stay in view", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/faq");
		const nav = await questions(page).boundingBox();
		const answer = await page.locator("main section").first().boundingBox();
		expect(nav && answer && nav.x + nav.width <= answer.x).toBe(true);
		await page.locator("#help").scrollIntoViewIfNeeded();
		const after = await questions(page).boundingBox();
		expect(after && after.y >= 0 && after.y < 200).toBe(true);
	});

	test("the question being read is marked in the list", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/faq");
		await page.locator("#open-source").evaluate((h) => h.scrollIntoView({ block: "start" }));
		await expect(questions(page).locator('a[aria-current="true"]')).toHaveAttribute(
			"href",
			"#open-source",
		);
	});

	test("on a phone the questions come first, above the answers", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		await page.goto("/faq");
		const nav = await questions(page).boundingBox();
		const answer = await page.locator("main section").first().boundingBox();
		expect(nav && answer && nav.y + nav.height <= answer.y).toBe(true);
	});
});

/** The lighter Verovio on jsDelivr: its module, and the WebAssembly beside it. */
const ENGRAVER = "https://cdn.jsdelivr.net/npm/@barmark/engraver@0.1.1/dist/";
const ENGRAVER_MODULE = `${ENGRAVER}verovio-module.mjs`;
const ENGRAVER_WASM = `${ENGRAVER}verovio-module.wasm`;

test.describe("the score", () => {
	const source = (page: Page) => page.getByRole("textbox", { name: "Barmark source of the chart" });
	let errors: string[] = [];
	test.beforeEach(({ page }) => {
		errors = watchErrors(page);
	});
	test.afterEach(() => {
		expect(errors).toEqual([]);
	});

	test("the home page starts loading Verovio from jsDelivr when a reader reaches for Score", async ({
		page,
	}) => {
		const engine: string[] = [];
		page.on("request", (r) => {
			if (/worker|verovio|wasm/i.test(r.url())) engine.push(r.url());
		});
		await page.goto("/");
		await page.waitForFunction(() => customElements.get("barmark-score"));
		await page.waitForLoadState("networkidle");
		expect(engine).toEqual([]);
		const cdn = page.waitForRequest(ENGRAVER_MODULE);
		await page.locator("main barmark-score").getByRole("radio", { name: "Score" }).hover();
		await cdn;
	});

	test("Try It's chart starts loading Verovio from jsDelivr once the page is idle", async ({
		page,
	}) => {
		const cdn = page.waitForRequest(ENGRAVER_MODULE);
		await page.goto(`/try?q=${encodeURIComponent("key: G\n| G | C |")}`);
		await expect(page.locator("[data-reading] barmark-score")).toHaveAttribute("preload", "idle");
		await cdn;
	});

	test("the home page loads Verovio only on intent, and draws the score as SVG", async ({
		page,
	}) => {
		const engine: string[] = [];
		page.on("request", (r) => {
			if (/worker|verovio|wasm/i.test(r.url())) engine.push(r.url());
		});
		const warnings: string[] = [];
		page.on("console", (m) => {
			if (m.type() === "warning") warnings.push(m.text());
		});
		await page.goto("/");
		await page.waitForFunction(() => customElements.get("barmark-score"));
		await page.waitForLoadState("networkidle");
		expect(engine).toEqual([]);
		await pressScore(page);
		// Verovio came from jsDelivr, its module and its .wasm, and both matched their digests:
		// the element warns when it falls back to its own copy.
		expect(engine.filter((u) => u.startsWith("https://cdn.jsdelivr.net/"))).toEqual([
			ENGRAVER_MODULE,
			ENGRAVER_WASM,
		]);
		expect(warnings.filter((w) => w.includes("Verovio"))).toEqual([]);
		expect(await scoreText(page)).toContain("Amazing Grace");
		const score = page.locator("main barmark-score");
		await expect(score.getByRole("radio", { name: "Score" })).toBeChecked();
		await expect(score.getByRole("img", { name: "Amazing Grace" })).toBeVisible();
		// Chord symbols as the chart spells them.
		const chords = await scoreChords(page);
		expect(chords.slice(0, 4)).toEqual(["D", "G", "G", "G7"]);
	});

	test("a score loads the lite build, with no fallback warning", async ({ page }) => {
		const warnings: string[] = [];
		page.on("console", (m) => {
			if (m.type() === "warning") warnings.push(m.text());
		});
		const requested: string[] = [];
		page.on("request", (r) => requested.push(r.url()));
		const fetched: { url: string; status: number; bytes: number }[] = [];
		page.on("requestfinished", async (r) => {
			const response = await r.response();
			const sizes = await r.sizes();
			fetched.push({
				url: r.url(),
				status: response?.status() ?? 0,
				bytes: sizes.responseBodySize,
			});
		});
		await page.goto("/");
		await pressScore(page);
		await expect(
			page.locator("main barmark-score").getByRole("img", { name: "Amazing Grace" }),
		).toBeVisible();
		expect(warnings.filter((w) => w.includes("was not used"))).toEqual([]);
		const wasm = fetched.find((f) => f.url === ENGRAVER_WASM);
		expect(wasm?.status).toBe(200);
		expect(fetched.find((f) => f.url === ENGRAVER_MODULE)?.status).toBe(200);
		// Neither stock Verovio from jsDelivr nor the site's own copy was asked for. The own copy
		// is the worker's hashed chunk (about 8 MB), the only file under workers/chunks/, imported
		// only on a fallback; matched by path, as its hash changes with each build.
		expect(
			requested.filter((u) => /\/verovio@|\/_app\/immutable\/workers\/chunks\//.test(u)),
		).toEqual([]);
		console.log(
			`engraver transfer: ${fetched
				.filter((f) => f.url.startsWith(ENGRAVER))
				.map((f) => `${f.url.slice(ENGRAVER.length)} ${f.bytes} B`)
				.join(", ")}`,
		);
	});

	test("the score follows the source as it is edited", async ({ page }) => {
		await page.goto("/");
		await pressScore(page);
		await source(page).fill("# Changed Song\nkey: G\n| G | C |");
		await expect.poll(() => scoreText(page), { timeout: 15_000 }).toContain("Changed Song");
		await expect.poll(() => scoreChords(page)).toEqual(["G", "C"]);
	});

	test("the chord spelling is the grid's: Score sets it aside, Grid brings it back", async ({
		page,
	}) => {
		await page.goto("/");
		const spelling = page.getByRole("radiogroup", { name: "Chord spelling" });
		await pressScore(page);
		await expect(spelling.getByRole("radio", { name: "Nashville" })).toBeDisabled();
		await page.locator("main barmark-score").getByRole("radio", { name: "Grid" }).click();
		await expect(spelling.getByRole("radio", { name: "Nashville" })).toBeEnabled();
	});

	test("sharps and flats in the score's chord symbols are drawn: the element brings Verovio's font", async ({
		page,
	}) => {
		await page.goto(`/try?q=${encodeURIComponent("key: E\n| C#m7 | Bb |")}`);
		await pressScore(page, "[data-reading]");
		await expect
			.poll(() =>
				page.evaluate(async () => {
					await document.fonts.ready;
					return [...document.fonts].some((f) => f.family === "Leipzig" && f.status === "loaded");
				}),
			)
			.toBe(true);
		// The package registers it, once; no site code copies it.
		expect(await page.locator("head style[data-barmark-score-font]").count()).toBe(1);
		expect(await page.locator("style[data-verovio-font]").count()).toBe(0);
		// The sharp is a Leipzig glyph between C and m7, drawn with a width of its own.
		const sharp = await page.evaluate(() => {
			const glyph = document
				.querySelector("[data-reading] barmark-score")
				?.shadowRoot?.querySelector(
					'.bms-score g.harm tspan[font-family="Leipzig"]',
				) as SVGTextContentElement | null;
			return glyph ? glyph.getComputedTextLength() : 0;
		});
		expect(sharp).toBeGreaterThan(0);
		// SMuFL's chord-symbol sharp and flat (csymAccidentalSharp, csymAccidentalFlat).
		expect(await scoreChords(page)).toEqual(["C\uEA66m7", "B\uEA64"]);
	});

	test("the Grid / Score switch is legible on the dark page, themed by the element itself", async ({
		page,
	}) => {
		await page.goto("/");
		await page.waitForFunction(() => customElements.get("barmark-score"));
		const looks = await page.evaluate(() => {
			const root = document.querySelector("main barmark-score")?.shadowRoot;
			const lum = (color: string) => {
				const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map(Number);
				return (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)) / 255;
			};
			return [...(root?.querySelectorAll(".bms-switch [data-view]") ?? [])].map((b) =>
				lum(getComputedStyle(b).color),
			);
		});
		expect(looks.length).toBe(2);
		for (const l of looks) expect(l).toBeGreaterThan(0.7);
	});

	test("Try It's preview switches to Score and engraves again as you type", async ({ page }) => {
		await page.goto(`/try?q=${encodeURIComponent("# Tried\n| D | A |")}`);
		const box = page.getByRole("textbox", { name: "Barmark to read" });
		await pressScore(page, "[data-reading]");
		expect(await scoreText(page, "[data-reading]")).toContain("Tried");
		await box.fill("# Retyped\n| D | A | G |");
		await expect
			.poll(() => scoreText(page, "[data-reading]"), { timeout: 15_000 })
			.toContain("Retyped");
	});

	test("Try It's diagram switch is the grid's: Score sets it aside, and a new chart starts on Grid", async ({
		page,
	}) => {
		await page.goto(`/try?q=${encodeURIComponent("| D | A |")}`);
		const box = page.getByRole("textbox", { name: "Barmark to read" });
		const toggle = page.getByRole("button", { name: "Guitar diagrams" });
		await pressScore(page, "[data-reading]");
		await expect(toggle).toBeDisabled();
		// A chord takes the chart away; the next chart opens on Grid, its switch usable again.
		await box.fill("C");
		await expect(toggle).toHaveCount(0);
		await box.fill("| D | A |");
		await expect(toggle).toBeEnabled();
	});

	test.describe("on a phone", () => {
		test.use({ viewport: { width: 360, height: 800 } });
		test("the score scrolls inside its window, never the page", async ({ page }) => {
			await page.goto("/");
			await pressScore(page);
			const [scroll, client] = await page.evaluate(() => [
				document.documentElement.scrollWidth,
				document.documentElement.clientWidth,
			]);
			expect(scroll).toBeLessThanOrEqual(client);
		});
	});
});

test.describe("the score without JavaScript", () => {
	test.use({ javaScriptEnabled: false });
	test("the home page shows the Grid / Score switch, on Grid, over the drawn grid", async ({
		page,
	}) => {
		await page.goto("/");
		const score = page.locator("main barmark-score");
		await expect(score.getByRole("radio", { name: "Grid" })).toBeChecked();
		await expect(score.getByRole("radio", { name: "Score" })).not.toBeChecked();
		expect(await chartText(page)).toContain("Amazing Grace");
	});
});

test.describe("the key", () => {
	const source = (page: Page) => page.getByRole("textbox", { name: "Barmark source of the chart" });
	const keyButton = (page: Page) => page.getByRole("button", { name: /^Key: / });
	const menu = (page: Page) => page.getByRole("menu", { name: "Key" });
	/** Opens the menu, repeated until the page's script has run. */
	const open = (page: Page) =>
		expect(async () => {
			if (!(await menu(page).isVisible())) await keyButton(page).click();
			await expect(menu(page)).toBeVisible({ timeout: 1_000 });
		}).toPass({ timeout: 15_000 });
	let errors: string[] = [];
	test.beforeEach(({ page }) => {
		errors = watchErrors(page);
	});
	test.afterEach(() => {
		expect(errors).toEqual([]);
	});

	test("picking a key redraws the grid's chords, and the source stays as written", async ({
		page,
	}) => {
		await page.goto("/");
		await expect(keyButton(page)).toHaveAccessibleName("Key: G");
		await source(page).fill("key: G\n| G | C |");
		await expect(keyButton(page)).toHaveAccessibleName("Key: G");
		await open(page);
		const items = menu(page).getByRole("menuitemradio");
		await expect(items).toHaveText([
			"G (original)",
			"Ab",
			"A",
			"Bb",
			"B",
			"C",
			"Db",
			"D",
			"Eb",
			"E",
			"F",
			"F#",
		]);
		await expect(menu(page).getByRole("menuitemradio", { name: "G (original)" })).toBeChecked();
		await menu(page).getByRole("menuitemradio", { name: "A", exact: true }).click();
		await expect(menu(page)).toBeHidden();
		await expect(keyButton(page)).toHaveAccessibleName("Key: A");
		await expect.poll(() => gridChords(page)).toEqual(["A", "D"]);
		await expect(source(page)).toHaveValue("key: G\n| G | C |");
	});

	test("in Score view a new key engraves the score again", async ({ page }) => {
		await page.goto("/");
		await source(page).fill("# Moved\nkey: G\n| G | C |");
		await pressScore(page);
		await expect.poll(() => scoreChords(page)).toEqual(["G", "C"]);
		await open(page);
		await menu(page).getByRole("menuitemradio", { name: "A", exact: true }).click();
		await expect.poll(() => scoreChords(page), { timeout: 15_000 }).toEqual(["A", "D"]);
	});

	test("a chart with no key offers distances", async ({ page }) => {
		await page.goto("/");
		await source(page).fill("| D | A |");
		await expect(keyButton(page)).toHaveAccessibleName("Key: Original");
		await open(page);
		await expect(menu(page).getByRole("menuitemradio")).toHaveText([
			"Original",
			"Up 1",
			"Up 2",
			"Up 3",
			"Up 4",
			"Up 5",
			"Up 6",
			"Down 1",
			"Down 2",
			"Down 3",
			"Down 4",
			"Down 5",
		]);
		await menu(page).getByRole("menuitemradio", { name: "Up 2" }).click();
		await expect(keyButton(page)).toHaveAccessibleName("Key: +2");
		await expect.poll(() => gridChords(page)).toEqual(["E", "B"]);
	});

	test("works from the keyboard: arrows move, Enter picks, Escape closes", async ({ page }) => {
		await page.goto("/");
		await source(page).fill("key: G\n| G | C |");
		await open(page);
		await page.keyboard.press("Escape");
		await expect(menu(page)).toBeHidden();
		await expect(keyButton(page)).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(menu(page).getByRole("menuitemradio", { name: "G (original)" })).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await expect(menu(page).getByRole("menuitemradio", { name: "Ab" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(menu(page)).toBeHidden();
		await expect(keyButton(page)).toHaveAccessibleName("Key: Ab");
		await expect(keyButton(page)).toBeFocused();
		await expect.poll(() => gridChords(page)).toEqual(["A♭", "D♭"]);
	});
});

test("the footer's Verovio licence and its GPL are served as text", async ({ page, request }) => {
	await page.goto("/");
	const href = await page.locator("footer a", { hasText: "LGPL-3.0" }).getAttribute("href");
	expect(href).toBe("/licenses/Verovio-LGPL-3.0.txt");
	for (const path of [href ?? "", "/licenses/Verovio-GPL-3.0.txt"]) {
		const res = await request.get(path);
		expect([path, res.status()]).toEqual([path, 200]);
		expect(res.headers()["content-type"]).toContain("text/plain");
		expect(await res.text()).toContain("GENERAL PUBLIC LICENSE");
	}
});
