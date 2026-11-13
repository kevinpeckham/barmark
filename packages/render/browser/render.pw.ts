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

/** Counts the page's requests for a path, from now on. */
function countFetches(page: Page, path: string): { count: number } {
	const fetches = { count: 0 };
	page.on("request", (r) => {
		if (r.url().endsWith(path)) fetches.count++;
	});
	return fetches;
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

	test("with wrap off, a long row stays one row on a phone, wider than its box", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await page.goto("/chart?chart=long&wrap=off");
		const { display, grid, chart } = await inChart(page, (root) => {
			const g = root.querySelector(".bm-grid") as Element;
			return {
				display: getComputedStyle(g).display,
				grid: g.getBoundingClientRect().width,
				chart: (root.querySelector(".bm-chart") as Element).getBoundingClientRect().width,
			};
		});
		expect(display).toBe("grid");
		expect(grid).toBeGreaterThan(chart);
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
		const fetches = countFetches(page, "/example.chart.md");
		await page.goto("/element");
		await expect(page.locator("#remote .bm-title")).toHaveText("Example Song");
		await page.evaluate(() => {
			const el = document.querySelector("#remote") as HTMLElement & { theme: string };
			el.theme = "dark";
		});
		await expect(page.locator("#remote .bm-chart")).toHaveAttribute("data-theme", "dark");
		expect(fetches.count).toBe(1);
	});

	test("a server-rendered chart follows its attributes", async ({ page }) => {
		await page.goto("/element");
		await page.evaluate(() => {
			const el = document.querySelector("#server") as HTMLElement & {
				theme: string;
				barNumbers: boolean;
				wrap: boolean;
			};
			el.theme = "dark";
			el.barNumbers = false;
			el.wrap = false;
		});
		await expect(page.locator("#server .bm-chart")).toHaveAttribute("data-theme", "dark");
		await expect(page.locator("#server .bm-chart")).toHaveAttribute("data-bar-numbers", "off");
		await expect(page.locator("#server .bm-chart")).toHaveAttribute("data-wrap", "off");
	});

	test("registers the font once however many charts there are", async ({ page }) => {
		await page.goto("/element");
		await expect(page.locator("#remote .bm-title")).toHaveText("Example Song");
		expect(await page.locator("style[data-barmark-font]").count()).toBe(1);
	});
});

test.describe("piano marks", () => {
	test("pedal marks sit under their slot, inside their row", async ({ page }) => {
		await page.goto("/chart?chart=piano");
		await page.evaluate(() => document.fonts.ready);
		const marks = await inChart(page, (root) =>
			[...root.querySelectorAll(".bm-pedal")].map((p) => {
				const box = p.getBoundingClientRect();
				const slot = (p.parentElement as Element).getBoundingClientRect();
				const bar = (p.closest(".bm-bar") as Element).getBoundingClientRect();
				return {
					below: box.top >= slot.top + slot.height / 2,
					inside: box.bottom <= bar.bottom + 1,
				};
			}),
		);
		expect(marks).toEqual([
			{ below: true, inside: true },
			{ below: true, inside: true },
		]);
	});
	test("a part's lines stack as rows, with a dot after the dotted member", async ({ page }) => {
		await page.goto("/chart?chart=piano");
		const labels = await inChart(page, (root) =>
			[...root.querySelectorAll(".bm-part-label")].map((l) => l.textContent),
		);
		expect(labels).toEqual(["Pno.RH", "Pno.LH", "Bs"]);
		for (const path of ["/chart?chart=piano", "/chart?chart=pianoAlone"]) {
			await page.goto(path);
			const clear = await inChart(page, (root) =>
				[...root.querySelectorAll(".bm-part-label")].map((l) => {
					const row = l.closest(".bm-part-row") as Element;
					const bar = row.querySelector(".bm-bar-body") as Element;
					return l.getBoundingClientRect().right <= bar.getBoundingClientRect().left;
				}),
			);
			expect(clear.length).toBeGreaterThan(0);
			expect(clear.every(Boolean)).toBe(true);
		}
		await expect(page.locator(".bm-group[data-dotted] .bm-dot")).toBeVisible();
	});
});

test.describe("lyrics", () => {
	test("a voice line's syllables sit under its pitch names, verse under verse", async ({
		page,
	}) => {
		await page.goto("/chart?chart=lead");
		await page.evaluate(() => document.fonts.ready);
		const placed = await inChart(page, (root) => {
			const box = (e: Element | null | undefined) => e?.getBoundingClientRect() ?? new DOMRect();
			const melody = root.querySelector(".bm-sings") as Element;
			// Each note's column: its pitch name, then each verse's syllable, stacked and left-aligned.
			const columns = [...melody.querySelectorAll(".bm-sung")].map((c) => {
				const note = box(c.querySelector(".bm-sung-note"));
				const lines = [...c.querySelectorAll(".bm-under")].map(box);
				return {
					under: lines.every(
						(l, i) => l.top >= (i ? (lines[i - 1]?.bottom ?? 0) : note.bottom) - 1,
					),
					aligned: lines.every((l) => Math.abs(l.left - note.left) <= 1),
				};
			});
			// Each verse's number on its verse's line, left of the first bar line.
			const bar = box(melody.querySelector(".bm-bar"));
			const numbers = [...melody.querySelectorAll(".bm-verse")].map((n, i) => {
				const line = box(melody.querySelectorAll(`.bm-under[data-verse="${i + 1}"]`)[0]);
				const b = box(n);
				return (
					b.right <= bar.left &&
					Math.abs((b.top + b.bottom) / 2 - (line.top + line.bottom) / 2) <= 3
				);
			});
			// No syllable runs into the next one on its line.
			const clear = [1, 2].every((v) => {
				const words = [...melody.querySelectorAll(`.bm-under[data-verse="${v}"] .bm-syllable`)].map(
					box,
				);
				return words.every((w, i) => i === 0 || (words[i - 1]?.right ?? 0) <= w.left);
			});
			return {
				columns: columns.length,
				under: columns.every((c) => c.under),
				aligned: columns.every((c) => c.aligned),
				numbers,
				clear,
				extender: box(root.querySelector(".bm-extender")).width > 4,
			};
		});
		expect(placed).toEqual({
			columns: 14,
			under: true,
			aligned: true,
			numbers: [true, true],
			clear: true,
			extender: true,
		});
	});
});

test.describe("lyric rows on no melody", () => {
	test("on a phone, each bar's words wrap with the bar they cover", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		for (const chart of ["spoken", "verses"]) {
			await page.goto(`/chart?chart=${chart}`);
			await page.evaluate(() => document.fonts.ready);
			const lines = await inChart(page, (root) =>
				[...root.querySelectorAll(".bm-beats")].map((line) => {
					const bar = line.closest(".bm-bar") as Element;
					const chord = bar.querySelector(".bm-bar-body") as Element;
					return {
						left:
							Math.abs(line.getBoundingClientRect().left - chord.getBoundingClientRect().left) <= 1,
						under: line.getBoundingClientRect().top >= chord.getBoundingClientRect().bottom - 1,
						chord: chord.querySelector(".bm-chord") !== null,
					};
				}),
			);
			expect(lines.length).toBeGreaterThan(0);
			expect(lines.every((l) => l.left && l.under && l.chord)).toBe(true);
			// The narrow screen does wrap: the bars sit on more than one line.
			const tops = await inChart(
				page,
				(root) =>
					new Set(
						[...root.querySelectorAll(".bm-bar")].map((b) =>
							Math.round(b.getBoundingClientRect().top),
						),
					).size,
			);
			expect(tops).toBeGreaterThan(chart === "spoken" ? 1 : 2);
		}
	});
});

test.describe("accessibility", () => {
	test("a screen reader hears sections and bars as music", async ({ page }) => {
		await page.goto("/chart");
		const snapshot = await page.locator("barmark-chart").ariaSnapshot();
		expect(snapshot).toContain("Verse");
		expect(snapshot).toContain("bar 5: D");
		expect(snapshot).toContain("bar 18: A seven sus four, hold, A seven, hold");
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

test.describe("row spacing", () => {
	/** The vertical gaps between bars on consecutive lines, in px. */
	const gaps = (page: Page) =>
		inChart(page, (root) => {
			const boxes = [...root.querySelectorAll(".bm-bar")].map((b) => b.getBoundingClientRect());
			const lines = [...new Set(boxes.map((b) => Math.round(b.top)))].sort((a, b) => a - b);
			return lines.slice(1).map((top, i) => {
				const above = boxes.filter((b) => Math.round(b.top) === lines[i]);
				return top - Math.max(...above.map((b) => b.bottom));
			});
		});

	test("bar lines of consecutive rows don't touch", async ({ page }) => {
		await page.goto("/chart?chart=long");
		const g = await gaps(page);
		expect(g.length).toBeGreaterThan(0);
		for (const gap of g) expect(gap).toBeGreaterThanOrEqual(4);
	});

	test("nor do bars on wrapped lines, on a phone", async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await page.goto("/chart?chart=long");
		const g = await gaps(page);
		expect(g.length).toBeGreaterThan(2);
		for (const gap of g) expect(gap).toBeGreaterThanOrEqual(4);
	});
});

test.describe("tempo changes", () => {
	test("bars inside a rit. carry a dashed line in the directive colour", async ({ page }) => {
		await page.goto(
			`/chart?chart=rit&css=${encodeURIComponent("barmark-chart{--barmark-directive:rgb(1, 2, 3)}")}`,
		);
		const lines = await inChart(page, (root) =>
			[...root.querySelectorAll(".bm-bar")].map((bar) => {
				const s = getComputedStyle(bar, "::before");
				return s.borderTopStyle === "none" ? "none" : `${s.borderTopStyle} ${s.borderTopColor}`;
			}),
		);
		expect(lines).toEqual(["none", "none", "dashed rgb(1, 2, 3)", "dashed rgb(1, 2, 3)"]);
	});
});

test.describe("triplet brackets", () => {
	test("leave a gap for the number instead of painting over the line, so any paper works", async ({
		page,
	}) => {
		await page.goto(
			`/chart?chart=triplets&css=${encodeURIComponent("barmark-chart{--barmark-paper:rgba(255,0,0,.3)}")}`,
		);
		const marks = await inChart(page, (root) =>
			[...root.querySelectorAll(".bm-group")].map((group) => {
				const tuplet = group.querySelector(".bm-tuplet") as HTMLElement;
				const range = document.createRange();
				range.selectNodeContents(tuplet);
				const digits = [...range.getClientRects()].find((r) => r.width > 0) as DOMRect;
				const box = tuplet.getBoundingClientRect();
				const span = group.getBoundingClientRect();
				const half = (which: "::before" | "::after") =>
					Number.parseFloat(getComputedStyle(tuplet, which).width);
				return {
					text: tuplet.textContent,
					background: getComputedStyle(tuplet).backgroundColor,
					spans: Math.abs(box.left - span.left) < 1 && Math.abs(box.right - span.right) < 1,
					clear:
						half("::before") > 0 &&
						half("::after") > 0 &&
						box.left + half("::before") <= digits.left &&
						box.right - half("::after") >= digits.right,
					oldLine: getComputedStyle(group, "::before").content,
				};
			}),
		);
		expect(marks.map((m) => m.text)).toEqual(["3", "12"]);
		for (const m of marks)
			expect(m).toMatchObject({
				background: "rgba(0, 0, 0, 0)",
				spans: true,
				clear: true,
				oldLine: "none",
			});
	});
});

test.describe("the element's text property", () => {
	const heading = (page: Page, id: string) => page.locator(`#${id} .bm-heading`).first();

	test("the numerals property redraws chords as degrees, and null brings the names back", async ({
		page,
	}) => {
		await page.goto("/element");
		const chord = page.locator("#inline .bm-chord").first();
		await page.evaluate(() => {
			const el = document.querySelector("#inline") as HTMLElement & {
				text: string | null;
				numerals: string | null;
			};
			el.text = "key: D\n| A7 | Bm |";
			el.numerals = "nashville";
		});
		await expect(chord).toHaveText("57");
		await expect(page.locator("#inline")).toHaveAttribute("numerals", "nashville");
		await page.evaluate(() => {
			(document.querySelector("#inline") as HTMLElement & { numerals: string | null }).numerals =
				"roman";
		});
		await expect(chord).toHaveText("V7");
		await page.evaluate(() => {
			(document.querySelector("#inline") as HTMLElement & { numerals: string | null }).numerals =
				null;
		});
		await expect(chord).toHaveText("A7");
	});

	test("typing into a textarea that sets text updates the chart", async ({ page }) => {
		await page.goto("/element");
		await page.locator("#editor").fill("## Bridge\n| C | G |");
		await expect(heading(page, "typed")).toHaveText("Bridge");
		await page.locator("#editor").fill("## Coda\n| D |");
		await expect(heading(page, "typed")).toHaveText("Coda");
	});

	test("an element made by script renders its text, and text beats src and a script child without fetching", async ({
		page,
	}) => {
		const fetches = countFetches(page, "/example.chart.md");
		await page.goto("/element");
		await page.evaluate(() => {
			const el = document.createElement("barmark-chart") as HTMLElement & { text: string | null };
			el.id = "made";
			el.setAttribute("src", "/example.chart.md");
			el.innerHTML = '<script type="text/barmark">## Inline\n| A |</script>';
			el.text = "## Made\n| G |";
			document.body.append(el);
		});
		await expect(heading(page, "made")).toHaveText("Made");
		expect(fetches.count).toBe(1); // only #remote's
	});

	test("text set back to null falls back to the script child", async ({ page }) => {
		await page.goto("/element");
		await page.evaluate(() => {
			(document.querySelector("#inline") as HTMLElement & { text: string | null }).text =
				"## Set\n| G |";
		});
		await expect(heading(page, "inline")).toHaveText("Set");
		await page.evaluate(() => {
			(document.querySelector("#inline") as HTMLElement & { text: string | null }).text = null;
		});
		await expect(heading(page, "inline")).toHaveText("Verse");
	});

	test("a server-rendered chart takes new text into its own shadow root", async ({ page }) => {
		await page.goto("/element");
		const same = await page.evaluate(async () => {
			const el = document.querySelector("#server") as HTMLElement & { text: string | null };
			const root = el.shadowRoot;
			el.text = "## Chorus\n| G |";
			await new Promise((r) => setTimeout(r, 50));
			return el.shadowRoot === root;
		});
		expect(same).toBe(true);
		await expect(heading(page, "server")).toHaveText("Chorus");
	});

	test("a server-rendered chart keeps its theme and letters when the element loads and takes text", async ({
		page,
	}) => {
		await page.goto("/element");
		const look = () =>
			page.locator("#styled").evaluate((el) => {
				const root = el.shadowRoot as ShadowRoot;
				const chart = root.querySelector(".bm-chart") as HTMLElement;
				return `${chart.dataset.theme} ${root.querySelector(".bm-rehearsal")?.textContent ?? "-"}`;
			});
		await expect.poll(look).toBe("dark A");
		await page.evaluate(() => {
			(document.querySelector("#styled") as HTMLElement & { text: string | null }).text =
				"## Bridge\n| C |";
		});
		await expect(heading(page, "styled")).toContainText("Bridge");
		expect(await look()).toBe("dark A");
	});

	test("text set before the element is defined is kept", async ({ page }) => {
		await page.goto("/element");
		await expect(heading(page, "early")).toHaveText("Early");
	});

	test("several changes in one task render once", async ({ page }) => {
		await page.goto("/element");
		await expect(heading(page, "server")).toHaveText("Verse");
		const renders = await page.evaluate(async () => {
			const el = document.querySelector("#server") as HTMLElement & {
				text: string | null;
				theme: string;
				rehearsalLetters: boolean;
			};
			let records = 0;
			new MutationObserver((list) => {
				records += list.length;
			}).observe(el.shadowRoot as ShadowRoot, { childList: true });
			el.text = "## One\n| G |";
			el.theme = "dark";
			el.rehearsalLetters = true;
			el.text = "## Two\n| C |";
			await new Promise((r) => setTimeout(r, 50));
			return records;
		});
		expect(renders).toBe(1);
		await expect(heading(page, "server")).toContainText("Two");
	});

	test("any string draws without an error, escaped", async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto("/element");
		const result = await page.evaluate(async () => {
			const el = document.querySelector("#typed") as HTMLElement & { text: string | null };
			const wait = () => new Promise((r) => setTimeout(r, 30));
			const seen: string[] = [];
			for (const text of [
				"",
				"<script>window.hacked = 1</script>\n<img src=x onerror=window.hacked=1>",
				"& &amp; <b>",
				Array.from({ length: 2000 }, (_, i) => `| C${i % 7 ? "" : "m"} | G |`).join("\n"),
			]) {
				el.text = text;
				await wait();
				const root = el.shadowRoot as ShadowRoot;
				seen.push(
					`${root.querySelectorAll("script, img, b").length}:${root.querySelector(".bm-chart") ? "chart" : "none"}`,
				);
			}
			return { seen, hacked: "hacked" in window };
		});
		expect(result.seen).toEqual(["0:chart", "0:chart", "0:chart", "0:chart"]);
		expect(result.hacked).toBe(false);
		expect(errors).toEqual([]);
	});
});

test.describe("several parts", () => {
	test("a system's rows share bar positions", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/chart?chart=parts");
		const lefts = await inChart(page, (root) =>
			[...(root.querySelector(".bm-system")?.querySelectorAll(".bm-part-row") ?? [])].map((row) =>
				[...row.querySelectorAll(".bm-bar")].map((b) => Math.round(b.getBoundingClientRect().left)),
			),
		);
		expect(lefts).toHaveLength(2);
		expect(lefts[0]?.length).toBe(4);
		for (const [i, x] of (lefts[1] ?? []).entries())
			expect(Math.abs(x - (lefts[0]?.[i] ?? 0))).toBeLessThanOrEqual(1);
	});
});

test.describe("show-part", () => {
	test("changing it redraws the chart as that part, and removing it brings the whole chart back", async ({
		page,
	}) => {
		await page.goto("/element");
		const systems = page.locator("#inline .bm-system");
		const meta = page.locator("#inline [part=meta]");
		await page.evaluate(() => {
			const el = document.querySelector("#inline") as HTMLElement & { text: string | null };
			el.text = "part: Gtr = Guitar\npart: Pno = Piano\nGtr | G | C |\nPno | Em | C |";
		});
		await expect(systems).toHaveCount(1);
		await page.evaluate(() => {
			(document.querySelector("#inline") as HTMLElement & { showPart: string | null }).showPart =
				"Pno";
		});
		await expect(page.locator("#inline")).toHaveAttribute("show-part", "Pno");
		await expect(systems).toHaveCount(0);
		await expect(meta).toHaveText("Piano");
		await page.evaluate(() => document.querySelector("#inline")?.removeAttribute("show-part"));
		await expect(systems).toHaveCount(1);
	});
});

/** Each drawn row's bars (bar-number gutter excluded): left, right and top, in px. */
type Bar = { left: number; right: number; top: number };
const barsOf = (page: Page, selector = "barmark-chart") =>
	inChart(
		page,
		(root) =>
			[...root.querySelectorAll(".bm-row")].map((row) =>
				[...row.querySelectorAll(":scope>.bm-bar")].map((bar) => {
					const r = bar.getBoundingClientRect();
					return { left: r.left, right: r.right, top: r.top };
				}),
			),
		selector,
	) as Promise<Bar[][]>;
/** Row r's bar i (from the end when negative), which the test expects to be there. */
function barAt(rows: Bar[][], r: number, i: number): Bar {
	const bar = rows[r]?.at(i);
	if (!bar) throw new Error(`no bar ${i} in row ${r}`);
	return bar;
}
const width = (bar: Bar) => bar.right - bar.left;
/** The chart at `path`, its font loaded, as rows of bars. */
async function drawnBars(page: Page, path: string): Promise<Bar[][]> {
	await page.goto(path);
	await page.evaluate(() => document.fonts.ready);
	return barsOf(page);
}

test.describe("columns", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1600, height: 900 });
	});

	test("shared: a busy bar widens its column in every row of the section, as before", async ({
		page,
	}) => {
		const rows = await drawnBars(page, "/chart?chart=columns");
		expect(width(barAt(rows, 0, 1))).toBeGreaterThan(2 * width(barAt(rows, 0, 0)));
		for (const i of [0, 1, 2, 3])
			expect(Math.abs(barAt(rows, 1, i).right - barAt(rows, 0, i).right)).toBeLessThan(1);
	});

	for (const odd of ["bogus", "ROW", ""])
		test(`an unknown value ("${odd}") lays out as shared`, async ({ page }) => {
			const shared = await drawnBars(page, "/chart?chart=columns");
			expect(await drawnBars(page, `/chart?chart=columns&columns=${odd}`)).toEqual(shared);
		});

	test("row: a busy bar widens only its own row", async ({ page }) => {
		const rows = await drawnBars(page, "/chart?chart=columns&columns=row");
		const [busy, plain] = [barAt(rows, 0, 1), barAt(rows, 1, 1)];
		expect(width(busy)).toBeGreaterThan(2 * width(barAt(rows, 0, 0)));
		// The plain row's second bar is as narrow as its first, far narrower than the busy one.
		expect(Math.abs(width(plain) - width(barAt(rows, 1, 0)))).toBeLessThan(1);
		expect(width(plain)).toBeLessThan(width(busy) / 2);
		// Its bar lines no longer line up with the busy row's, but both start at the first barline.
		expect(Math.abs(barAt(rows, 1, 0).left - barAt(rows, 0, 0).left)).toBeLessThan(1);
		expect(barAt(rows, 1, -1).right).toBeLessThan(barAt(rows, 0, -1).right - 50);
	});

	test("row: every row stays one line of bars, touching end to end", async ({ page }) => {
		const rows = await drawnBars(page, "/chart?chart=columns&columns=row");
		expect(rows.map((r) => r.length)).toEqual([4, 4, 2, 2, 2, 2, 8]);
		for (const row of rows)
			for (const [i, bar] of row.entries()) {
				expect(Math.abs(bar.top - (row[0]?.top ?? 0))).toBeLessThan(1);
				if (i > 0) expect(Math.abs(bar.left - (row[i - 1]?.right ?? 0))).toBeLessThan(1);
			}
	});

	test("row: endings, %, an unreadable slot and an error box still draw", async ({ page }) => {
		await page.goto("/chart?chart=columns&columns=row");
		await page.evaluate(() => document.fonts.ready);
		const drawn = await inChart(page, (root) => {
			const box = (s: string) => (root.querySelector(s) as Element).getBoundingClientRect();
			const style = (s: string) => getComputedStyle(root.querySelector(s) as Element);
			const ending = root.querySelector(".bm-ending>.bm-bar") as Element;
			const error = box(".bm-error");
			const rows = [...root.querySelectorAll(".bm-section:nth-of-type(2) .bm-row")];
			return {
				endingTop: getComputedStyle(ending).borderTopStyle,
				endingLabel: getComputedStyle(ending, "::after").content,
				repeatStart: style(".bm-row>div.bm-bar[data-repeat-start]").borderLeftStyle,
				simile: box(".bm-ending .bm-hold, .bm-ending .bm-chord").width > 0,
				unread: style(".bm-unread").textDecorationStyle,
				error: { width: error.width, height: error.height, top: error.top },
				rowAbove: (rows[3] as Element).getBoundingClientRect().bottom,
				rowBelow: (rows[4] as Element).querySelector(".bm-bar")?.getBoundingClientRect().top,
			};
		});
		expect(drawn.endingTop).toBe("solid");
		expect(drawn.endingLabel).toBe('"1."');
		expect(drawn.repeatStart).toBe("double");
		expect(drawn.simile).toBe(true);
		expect(drawn.unread).toBe("wavy");
		expect(drawn.error.width).toBeGreaterThan(50);
		expect(drawn.error.height).toBeGreaterThan(5);
		expect(drawn.error.top).toBeGreaterThanOrEqual(drawn.rowAbove - 1);
		expect(drawn.rowBelow ?? 0).toBeGreaterThanOrEqual(drawn.error.top + drawn.error.height - 1);
	});

	test("row: a system's parts keep their bar lines together", async ({ page }) => {
		for (const path of ["/chart?chart=piano&columns=row", "/chart?chart=parts&columns=row"]) {
			await page.goto(path);
			await page.evaluate(() => document.fonts.ready);
			const systems = await inChart(page, (root) =>
				[...root.querySelectorAll(".bm-system")].map((system) =>
					[...system.querySelectorAll(":scope>.bm-row")].map((row) =>
						[...row.querySelectorAll(":scope>.bm-bar")].map(
							(bar) => bar.getBoundingClientRect().right,
						),
					),
				),
			);
			expect(systems.length).toBeGreaterThan(0);
			for (const rows of systems)
				for (const row of rows)
					for (const [i, right] of row.entries())
						expect(Math.abs(right - (rows[0]?.[i] ?? 0))).toBeLessThan(1);
		}
	});

	const phone = async (page: Page, query: string) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await page.goto(
			`/chart?${query}&css=${encodeURIComponent("body{margin:0}barmark-chart{margin:0}")}`,
		);
		await page.evaluate(() => document.fonts.ready);
		return page.evaluate(() => ({
			scroll: document.documentElement.scrollWidth,
			client: document.documentElement.clientWidth,
		}));
	};
	for (const chart of ["columns", "long", "busy"])
		test(`row: ${chart} wraps on a phone without scrolling sideways`, async ({ page }) => {
			const { scroll, client } = await phone(page, `chart=${chart}&columns=row`);
			expect(scroll).toBeLessThanOrEqual(client);
		});
	// Morning Song's widest system is wider than a phone in either layout (its bars don't wrap inside a system).
	test("row: systems on a phone are no wider than shared", async ({ page }) => {
		const shared = await phone(page, "chart=parts");
		const row = await phone(page, "chart=parts&columns=row");
		expect(row.scroll).toBeLessThanOrEqual(shared.scroll);
	});

	test("row: a screen reader hears the same chart", async ({ page }) => {
		const heard = () =>
			page
				.locator("barmark-chart")
				.first()
				.evaluate((el) =>
					[...(el.shadowRoot?.querySelectorAll(".bm-sr, [aria-label], [role]") ?? [])].map(
						(e) => `${e.getAttribute("role")}|${e.getAttribute("aria-label")}|${e.textContent}`,
					),
				);
		for (const chart of ["columns", "parts", "lead"]) {
			await page.goto(`/chart?chart=${chart}`);
			const shared = await heard();
			await page.goto(`/chart?chart=${chart}&columns=row`);
			expect(await heard()).toEqual(shared);
		}
	});

	test("the element takes columns as an attribute, server-rendered or not", async ({ page }) => {
		await page.goto("/element");
		await expect(page.locator("#inline .bm-heading")).toHaveText("Verse");
		await page.evaluate(() => {
			(document.querySelector("#inline") as HTMLElement & { columns: string }).columns = "row";
			document.querySelector("#columns")?.setAttribute("columns", "row");
		});
		await expect(page.locator("#inline .bm-chart")).toHaveAttribute("data-columns", "row");
		await expect(page.locator("#columns .bm-chart")).toHaveAttribute("data-columns", "row");
		const rowed = await barsOf(page, "#columns");
		expect(width(barAt(rowed, 1, 0))).toBeLessThan(width(barAt(rowed, 0, 0)) / 2);
		await page.evaluate(() => document.querySelector("#columns")?.setAttribute("columns", "x"));
		await expect(page.locator("#columns .bm-chart")).not.toHaveAttribute("data-columns", /.*/);
		const shared = await barsOf(page, "#columns");
		expect(Math.abs(width(barAt(shared, 1, 0)) - width(barAt(shared, 0, 0)))).toBeLessThan(1);
	});
});

test.describe("chord diagrams", () => {
	/** The colour a probe with this CSS colour computes to, on this page. */
	const computed = (page: Page, css: string) =>
		page.evaluate((c) => {
			const probe = document.createElement("span");
			probe.style.color = c;
			document.body.append(probe);
			const value = getComputedStyle(probe).color;
			probe.remove();
			return value;
		}, css);

	/** A dot's fill and a string's stroke, in the chart's first diagram. */
	const drawn = (page: Page) =>
		inChart(page, (root) => ({
			dot: getComputedStyle(root.querySelector(".bm-dg-dot, .bm-dg-barre") as Element).fill,
			string: getComputedStyle(root.querySelector(".bm-dg-grid") as Element).stroke,
		}));

	for (const [scheme, ink, rule] of [
		["light", "rgb(29, 29, 31)", "rgb(74, 74, 74)"],
		["dark", "rgb(236, 232, 224)", "rgb(143, 137, 127)"],
	] as const)
		test(`in ${scheme}, a dot is the ink colour and a string the rule colour`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto(`/chart?chart=peaceful&diagrams=guitar&theme=${scheme}`);
			expect(await drawn(page)).toEqual({ dot: ink, string: rule });
		});

	test("printing, the strip uses the light palette", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "dark", media: "print" });
		await page.goto("/chart?chart=peaceful&diagrams=guitar");
		expect(await drawn(page)).toEqual({ dot: "rgb(29, 29, 31)", string: "rgb(74, 74, 74)" });
	});

	test("in forced colours, dots and strings take the system text colour", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/chart?chart=peaceful&diagrams=guitar");
		const text = await computed(page, "CanvasText");
		expect(await drawn(page)).toEqual({ dot: text, string: text });
	});

	for (const [name, width, css] of [
		["400% zoom", 320, ""],
		["large text on a phone", 360, "barmark-chart{--barmark-size:2.5rem}"],
	] as const)
		test(`on ${name} the strip wraps in rows without scrolling sideways`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(
				`/chart?chart=peaceful&diagrams=guitar&css=${encodeURIComponent(`body{margin:0}barmark-chart{margin:0}${css}`)}`,
			);
			await page.evaluate(() => document.fonts.ready);
			const { scroll, client } = await page.evaluate(() => ({
				scroll: document.documentElement.scrollWidth,
				client: document.documentElement.clientWidth,
			}));
			expect(scroll).toBeLessThanOrEqual(client);
			const tops = await inChart(page, (root) => [
				...new Set(
					[...root.querySelectorAll(".bm-diagram")].map((d) => d.getBoundingClientRect().top),
				),
			]);
			expect(tops.length).toBeGreaterThan(1);
		});

	test("the element draws the strip when chord-diagrams is set, and removes it with the attribute", async ({
		page,
	}) => {
		await page.goto("/element");
		const strip = page.locator("#diagrams .bm-diagrams");
		await expect(page.locator("#diagrams .bm-heading")).toHaveText("Verse");
		await expect(strip).toHaveCount(0);
		await page.evaluate(() =>
			document.querySelector("#diagrams")?.setAttribute("chord-diagrams", "guitar"),
		);
		await expect(strip).toHaveCount(1);
		await expect(page.locator("#diagrams .bm-diagram")).toHaveCount(3);
		await page.evaluate(() =>
			document.querySelector("#diagrams")?.removeAttribute("chord-diagrams"),
		);
		await expect(strip).toHaveCount(0);
	});

	test("diagram-hand moves the muted string to the right half", async ({ page }) => {
		await page.goto("/element");
		await page.evaluate(() =>
			document.querySelector("#diagrams")?.setAttribute("chord-diagrams", "guitar"),
		);
		// Am is x02210: its muted string is the low one, a cross.
		const cross = () =>
			page.locator("#diagrams").evaluate((el) => {
				const svg = el.shadowRoot?.querySelectorAll(".bm-diagram-svg")[1] as SVGSVGElement;
				const box = (svg.querySelector("path.bm-dg-mark") as SVGGraphicsElement).getBBox();
				const view = svg.viewBox.baseVal;
				return box.x + box.width / 2 - (view.x + view.width / 2);
			});
		await page.waitForFunction(() =>
			document.querySelector("#diagrams")?.shadowRoot?.querySelector(".bm-diagram-svg"),
		);
		expect(await cross()).toBeLessThan(0);
		await page.evaluate(() =>
			document.querySelector("#diagrams")?.setAttribute("diagram-hand", "left"),
		);
		await expect.poll(cross).toBeGreaterThan(0);
	});

	test("a server-rendered chart with no source ignores chord-diagrams, like numerals", async ({
		page,
	}) => {
		const errors: Error[] = [];
		page.on("pageerror", (e) => errors.push(e));
		await page.goto("/element");
		await expect(page.locator("#server .bm-heading")).toHaveText("Verse");
		await page.evaluate(() => {
			const el = document.querySelector("#server") as HTMLElement & {
				chordDiagrams: string | null;
				numerals: string | null;
			};
			el.numerals = "nashville";
			el.chordDiagrams = "guitar";
		});
		// The theme is restyled in the same pass, so once it shows, the diagrams were left alone.
		await page.evaluate(() => {
			(document.querySelector("#server") as HTMLElement & { theme: string }).theme = "dark";
		});
		await expect(page.locator("#server .bm-chart")).toHaveAttribute("data-theme", "dark");
		await expect(page.locator("#server .bm-diagrams")).toHaveCount(0);
		await expect(page.locator("#server .bm-heading")).toHaveText("Verse");
		expect(errors).toEqual([]);
	});

	test("the properties reflect their attributes, and read them back", async ({ page }) => {
		await page.goto("/element");
		const el = (p: Page) => p.locator("#diagrams");
		await expect(page.locator("#diagrams .bm-heading")).toHaveText("Verse");
		await el(page).evaluate((e) => {
			const chart = e as HTMLElement & { chordDiagrams: string | null; diagramHand: string };
			chart.chordDiagrams = "guitar";
			chart.diagramHand = "left";
		});
		await expect(el(page)).toHaveAttribute("chord-diagrams", "guitar");
		await expect(el(page)).toHaveAttribute("diagram-hand", "left");
		await expect(page.locator("#diagrams .bm-diagrams")).toHaveCount(1);
		await el(page).evaluate((e) => {
			(e as HTMLElement & { diagramHand: string }).diagramHand = "right";
		});
		await expect(el(page)).not.toHaveAttribute("diagram-hand");
		await el(page).evaluate((e) => {
			(e as HTMLElement & { chordDiagrams: string | null }).chordDiagrams = null;
		});
		await expect(el(page)).not.toHaveAttribute("chord-diagrams");
		await expect(page.locator("#diagrams .bm-diagrams")).toHaveCount(0);
		const read = await el(page).evaluate((e) => {
			const chart = e as HTMLElement & { chordDiagrams: string | null; diagramHand: string };
			const out = [chart.chordDiagrams, chart.diagramHand];
			chart.setAttribute("chord-diagrams", "guitar");
			chart.setAttribute("diagram-hand", "left");
			out.push(chart.chordDiagrams, chart.diagramHand);
			chart.setAttribute("chord-diagrams", "banjo");
			chart.setAttribute("diagram-hand", "up");
			out.push(chart.chordDiagrams, chart.diagramHand);
			return out;
		});
		expect(read).toEqual([null, "right", "guitar", "left", null, "right"]);
	});

	test("a fret number at the twelfth fret lies inside its drawing, left of the barre and the strings", async ({
		page,
	}) => {
		await page.goto("/chart?chart=high&diagrams=guitar");
		const found = await inChart(page, (root) => {
			const svg = root.querySelector(".bm-dg-fr") as SVGSVGElement;
			const label = (svg.querySelector(".bm-dg-fret") as SVGTextElement).getBBox();
			const view = svg.viewBox.baseVal;
			const grid = (svg.querySelector(".bm-dg-grid") as SVGGraphicsElement).getBBox();
			const barre = svg.querySelector(".bm-dg-barre") as SVGGraphicsElement | null;
			const bar = barre?.getBBox();
			return {
				text: svg.querySelector(".bm-dg-fret")?.textContent,
				hasBarre: barre !== null,
				inside:
					label.x >= view.x &&
					label.y >= view.y &&
					label.x + label.width <= view.x + view.width &&
					label.y + label.height <= view.y + view.height,
				clearOfStrings: label.x + label.width < grid.x,
				clearOfBarre: bar !== undefined && label.x + label.width < bar.x,
			};
		});
		expect(found).toEqual({
			text: "12fr",
			hasBarre: true,
			inside: true,
			clearOfStrings: true,
			clearOfBarre: true,
		});
	});
});
