import { expect, test } from "bun:test";
import { Losses } from "../../src/import/losses.js";

test("one diagnostic per kind and part, three measures shown", () => {
	const l = new Losses();
	for (const m of ["1", "2", "3", "4"])
		l.add("melody", "notes read as a melody and left out", "Lead", m);
	expect(l.list()).toEqual([
		{
			severity: "warning",
			part: "Lead",
			measure: "1",
			message: "notes read as a melody and left out in 4 measures: 1, 2, 3, …",
		},
	]);
});
test("a single measure is named plainly, parts are kept apart, notes pass through", () => {
	const l = new Losses();
	l.add("x", "lost", "A", "2");
	l.add("x", "lost", "B", "5");
	l.note({ severity: "error", message: "bad" });
	expect(l.list()).toEqual([
		{ severity: "warning", part: "A", measure: "2", message: "lost in measure 2" },
		{ severity: "warning", part: "B", measure: "5", message: "lost in measure 5" },
		{ severity: "error", message: "bad" },
	]);
});
