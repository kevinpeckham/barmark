/**
 * Import @barmark/fretboard as Node sees it and use it: check that standard
 * tuning has six strings, ask for the shape of every chord slot of a real
 * chart, and check that C is x32010. Plain Node, so it runs against the
 * local build (scripts/verify-package.ts) and against the copy installed
 * from npm (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-fretboard.mjs <module> <chart>
 *
 * Locally <module> is the built entry (dist/index.js); from npm it is the
 * package name. The chart is read with `barmark` (the sibling build locally,
 * the installed dependency from npm). Only the package's public exports are
 * used. Prints the counts as JSON; exit 1 if anything differs.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [spec, chartPath] = process.argv.slice(2);
const local = /^[./]/.test(spec);
const chart = readFileSync(chartPath, "utf8");

const barmarkSpec = local
	? pathToFileURL(resolve(dirname(resolve(spec)), "../../barmark/dist/index.js")).href
	: "barmark";
const { parseChart, parseChord } = await import(barmarkSpec);
const main = await import(local ? pathToFileURL(resolve(spec)).href : spec);

const strings = main.GUITAR?.strings;
const sixStrings = Array.isArray(strings) && strings.length === 6 && strings.every(Number.isFinite);

/** The chord slots of a list of slots, groups opened. */
function chordSlots(slots) {
	return slots
		.flatMap((s) => (s.kind === "group" ? s.members : [s]))
		.filter((s) => s.kind === "chord");
}

/** One part's harmony in a bar: its slots, and its lines but the one that sings. */
function partSlots(part, sings) {
	const lines = (part.lines ?? []).filter((l) => l.name !== sings);
	return [part, ...lines].flatMap((p) => chordSlots(p.slots));
}

/** Every harmony slot of a chart; a singing line's notes are melody and left out. */
function harmony(parse) {
	return parse.bars.flatMap((bar) => [
		...chordSlots(bar.slots),
		...(bar.parts ?? []).flatMap((part, i) => (part ? partSlots(part, parse.parts[i]?.sings) : [])),
	]);
}

const count = { named: 0, failedSounds: 0, placed: 0, singleNote: 0, notPlayable: 0 };
for (const { chord, voicing } of harmony(parseChart(chart))) {
	const named = chord.kind === "chord" && !voicing;
	const r = main.shapeFor(chord, voicing);
	if (!r.ok) count[r.reason === "single-note" ? "singleNote" : "notPlayable"]++;
	else if (named) {
		count.named++;
		if (!main.soundsChord(r.shape, chord)) count.failedSounds++;
	} else count.placed++;
}

const c = main.shapeFor(parseChord("C").value);
const cText = c.ok ? main.shapeText(c.shape) : null;
const result = { strings, ...count, c: cText };
console.log(JSON.stringify(result));
const good = sixStrings && count.named >= 5 && count.failedSounds === 0 && cText === "x32010";
process.exit(good ? 0 : 1);
