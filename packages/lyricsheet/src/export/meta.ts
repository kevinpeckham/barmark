import { type ChartParse, type Key, printKey } from "barmark";
import type { Losses } from "./losses.js";

/** A directive's text with no `{`, `}` or line break in it, runs of spaces made one. */
const clean = (value: string) =>
	value
		.replace(/[{}\r\n\u2028\u2029]/g, " ")
		.replace(/ {2,}/g, " ")
		.trim();

/** The one place a directive line is built: `{name: value}`, or `{name}` with no value. */
export function directive(name: string, value?: string): string {
	return value === undefined ? `{${name}}` : `{${name}: ${clean(value)}}`;
}

const isPlain = (key: Key) => key.mode === "major" || key.mode === "minor";

/** The chart's opening key, when it has one. */
const openingKey = (parse: ChartParse): Key | null => parse.bars[0]?.key ?? null;

/** What the header leaves out of the key: a church mode (spec 4.6). */
export function headerLosses(parse: ChartParse, losses: Losses): void {
	const key = openingKey(parse);
	const bar = parse.bars[0];
	if (key && !isPlain(key))
		losses.add(
			"key-mode",
			`ChordPro's {key} cannot name the mode ${key.mode}, so it is left out`,
			bar,
		);
}

/** Title, credits, then the opening key, time and tempo (spec 4.6); nothing is invented. */
export function headerLines(parse: ChartParse, title: string | undefined): string[] {
	const out: string[] = [];
	const named = title === undefined ? parse.title : (parse.title ?? title);
	if (named !== null && named.trim() !== "") out.push(directive("title", named));
	const { credits } = parse;
	for (const who of credits.composer) out.push(directive("composer", who));
	for (const who of credits.lyricist) out.push(directive("lyricist", who));
	for (const who of credits.arranger) out.push(directive("meta", `arranger ${who}`));
	for (const text of credits.copyright) out.push(directive("copyright", text));
	const first = parse.bars[0];
	const key = openingKey(parse);
	if (key && isPlain(key)) out.push(directive("key", printKey(key)));
	if (first) {
		const time = first.time ?? first.meter;
		out.push(directive("time", `${time.n}/${time.d}`));
		if (first.tempo !== null) out.push(directive("tempo", String(first.tempo)));
	}
	return out;
}
