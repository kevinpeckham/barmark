import type { ChartParse, Key } from "barmark";
import type { Losses } from "./losses.js";
import { spaced, textChanged, untagged } from "./text.js";

/**
 * A value as one line of plain text: `{`, `}`, every control character (C0,
 * DEL, C1, so tab, VT, NUL and NEL too) and U+2028/2029 become a space, runs
 * of spaces collapse and the ends are trimmed. A non-breaking space and the
 * other Unicode spaces stay: the output rules forbid tabs and controls only.
 */
const clean = (value: string) => spaced(value.replace(/[{}]/g, " ")).replace(/ {2,}/g, " ").trim();

/** The one place a directive line is built: `{name: value}`, or `{name}` with no value. */
export function directive(name: string, value?: string): string {
	return value === undefined ? `{${name}}` : `{${name}: ${clean(value)}}`;
}

/** The key as `{key}` writes it: ionian is major and aeolian minor (the same notes); the other modes have none. */
export function keyText(key: Key): string | null {
	if (key.mode === "major" || key.mode === "ionian") return key.tonic;
	if (key.mode === "minor" || key.mode === "aeolian") return `${key.tonic}m`;
	return null;
}

/** The chart's opening key, when it has one. */
const openingKey = (parse: ChartParse): Key | null => parse.bars[0]?.key ?? null;

/** The title the header writes: the chart's, else the option's, else none (written empty). */
const titleOf = (parse: ChartParse, title: string | undefined) =>
	[parse.title, title].find((t) => t != null && clean(t) !== "") ?? "";

/** The header's free text: its title and credits. */
const headerTexts = (parse: ChartParse, title: string | undefined) => {
	const { credits: c } = parse;
	return [titleOf(parse, title), ...c.composer, ...c.lyricist, ...c.arranger, ...c.copyright];
};

/** Whether a header text is written otherwise: tag-like markup, braces or a control character. */
const changed = (t: string) => untagged(t) !== t || /[{}]/.test(t) || spaced(t) !== t;

/** What the header leaves out or changes: a church mode in the key (spec 4.6), markup in its text. */
export function headerLosses(parse: ChartParse, losses: Losses, title?: string): void {
	if (headerTexts(parse, title).some(changed)) textChanged(losses);
	const key = openingKey(parse);
	const bar = parse.bars[0];
	if (key && keyText(key) === null)
		losses.add(
			"key-mode",
			`ChordPro's {key} cannot name the mode ${key.mode}, so it is left out`,
			bar,
		);
}

/** Title (always), credits, then the opening key, time and tempo (spec 4.6); nothing else is invented. */
export function headerLines(parse: ChartParse, title: string | undefined): string[] {
	// Always a title line: with none, the reference takes the first lyric line for the title.
	const out = [directive("title", untagged(titleOf(parse, title)))];
	const { credits } = parse;
	const add = (name: string, text: string) => out.push(directive(name, untagged(text)));
	for (const who of credits.composer) add("composer", who);
	for (const who of credits.lyricist) add("lyricist", who);
	for (const who of credits.arranger) add("meta", `arranger ${who}`);
	for (const text of credits.copyright) add("copyright", text);
	const first = parse.bars[0];
	const key = openingKey(parse);
	const keyed = key && keyText(key);
	if (keyed) out.push(directive("key", keyed));
	if (first) {
		const time = first.time ?? first.meter;
		out.push(directive("time", `${time.n}/${time.d}`));
		if (first.tempo !== null) out.push(directive("tempo", String(first.tempo)));
	}
	return out;
}
