import { describe, expect, test } from "bun:test";
import type { PlayedBar } from "barmark";
import { Losses } from "../src/export/losses.js";

/** Only `index` and `written` are read. */
const bar = (index: number, written: number) => ({ index, written }) as PlayedBar;

describe("Losses", () => {
	test("one loss per code, whatever the order added", () => {
		const l = new Losses();
		l.add("key-mode", "a", bar(1, 1));
		l.add("key-mode", "a", bar(2, 2));
		expect(l.list().length).toBe(1);
	});

	test("a replayed bar is named once", () => {
		const l = new Losses();
		for (const [i, w] of [
			[1, 1],
			[2, 2],
			[3, 1],
			[4, 2],
			[5, 3],
		] as const)
			l.add("key-mode", "m", bar(i, w));
		expect(l.list()[0]?.message).toBe("m (3 bars: 1, 2, 3)");
	});

	test("out of order adds list ascending and report the lowest bar, with its message", () => {
		const l = new Losses();
		l.add("key-mode", "nine", bar(9, 9));
		l.add("key-mode", "two", bar(2, 2));
		l.add("key-mode", "five", bar(5, 5));
		const [loss] = l.list();
		expect(loss?.message).toBe("two (3 bars: 2, 5, 9)");
		expect(loss?.bar).toBe(2);
		expect(loss?.written).toBe(2);
	});

	test("the lowest played bar of a replayed written bar is reported", () => {
		const l = new Losses();
		l.add("key-mode", "m", bar(7, 1));
		l.add("key-mode", "m", bar(3, 1));
		expect(l.list()[0]).toMatchObject({ bar: 3, written: 1, message: "m (bar 1)" });
	});

	test("one bar, two bars, thirty bars", () => {
		const text = (n: number) => {
			const l = new Losses();
			for (let i = 1; i <= n; i++) l.add("key-mode", "m", bar(i, i));
			return l.list()[0]?.message;
		};
		expect(text(1)).toBe("m (bar 1)");
		expect(text(2)).toBe("m (2 bars: 1, 2)");
		expect(text(30)).toBe("m (30 bars: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, …)");
	});

	test("a loss with no bar has no bar", () => {
		const l = new Losses();
		l.add("key-mode", "m");
		expect(l.list()).toEqual([{ code: "key-mode", message: "m" }]);
	});

	test("the same code with and without bars takes the bars", () => {
		const l = new Losses();
		l.add("key-mode", "none");
		l.add("key-mode", "four", bar(4, 4));
		l.add("key-mode", "none");
		expect(l.list()).toEqual([{ code: "key-mode", message: "four (bar 4)", bar: 4, written: 4 }]);
	});

	test("the pickup is named, not numbered", () => {
		const one = new Losses();
		one.add("key-mode", "m", bar(1, 0));
		expect(one.list()[0]?.message).toBe("m (the pickup)");
		const two = new Losses();
		two.add("key-mode", "m", bar(2, 1));
		two.add("key-mode", "m", bar(1, 0));
		expect(two.list()[0]?.message).toBe("m (2 bars: the pickup, 1)");
		expect(two.list()[0]?.written).toBe(0);
	});
});

describe("Losses scale", () => {
	const best = (run: (n: number) => void, n: number) => {
		run(1000);
		let ms = Number.POSITIVE_INFINITY;
		for (let i = 0; i < 7; i++) {
			const start = performance.now();
			run(n);
			ms = Math.min(ms, performance.now() - start);
		}
		return ms;
	};
	const same = (n: number) => {
		const l = new Losses();
		const b = bar(1, 1);
		for (let i = 0; i < n; i++) l.add("key-mode", "m", b);
		l.list();
	};
	const different = (n: number) => {
		const l = new Losses();
		for (let i = 1; i <= n; i++) l.add("key-mode", "m", bar(i, i));
		l.list();
	};
	test("100,000 adds of one bar are linear (ratio of best-of-seven timings)", () => {
		const ratio = best(same, 100_000) / Math.max(best(same, 10_000), 0.05);
		expect(ratio).toBeLessThan(40);
	}, 60_000);
	// A Map of 100,000 entries costs GC, so its ratio is noisy; the quadratic version took 17 s here.
	test("100,000 different bars take well under a second or two", () => {
		expect(best(different, 100_000)).toBeLessThan(2000);
	}, 60_000);
});
