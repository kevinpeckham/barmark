import type { ChartParse, Key } from "barmark";
import type { Losses } from "./losses.js";

/**
 * A value as one line of plain text: `{`, `}`, every control character (C0,
 * DEL, C1, so tab, VT, NUL and NEL too) and U+2028/2029 become a space, runs
 * of spaces collapse and the ends are trimmed. A non-breaking space and the
 * other Unicode spaces stay: the output rules forbid tabs and controls only.
 */
const clean = (value: string) =>
	value
		.replace(/[{}\p{Cc}\u2028\u2029]/gu, " ")
		.replace(/ {2,}/g, " ")
		.trim();

/** The one place a directive line is built: `{name: value}`, or `{name}` with no value. */
export function directive(name: string, value?: string): string {
	return value === undefined ? `{${name}}` : `{${name}: ${clean(value)}}`;
}

/** The key as `{key}` writes it: ionian is major and aeolian minor (the same notes); the other modes have none. */
function keyText(key: Key): string | null {
	if (key.mode === "major" || key.mode === "ionian") return key.tonic;
	if (key.mode === "minor" || key.mode === "aeolian") return `${key.tonic}m`;
	return null;
}

/** The chart's opening key, when it has one. */
const openingKey = (parse: ChartParse): Key | null => parse.bars[0]?.key ?? null;

/** What the header leaves out of the key: a church mode (spec 4.6). */
export function headerLosses(parse: ChartParse, losses: Losses): void {
	const key = openingKey(parse);
	const bar = parse.bars[0];
	if (key && keyText(key) === null)
		losses.add(
			"key-mode",
			`ChordPro's {key} cannot name the mode ${key.mode}, so it is left out`,
			bar,
		);
}

/** Title, credits, then the opening key, time and tempo (spec 4.6); nothing is invented. */
export function headerLines(parse: ChartParse, title: string | undefined): string[] {
	const out: string[] = [];
	const named = [parse.title, title].find((t) => t != null && clean(t) !== "");
	if (named != null) out.push(directive("title", named));
	const { credits } = parse;
	for (const who of credits.composer) out.push(directive("composer", who));
	for (const who of credits.lyricist) out.push(directive("lyricist", who));
	for (const who of credits.arranger) out.push(directive("meta", `arranger ${who}`));
	for (const text of credits.copyright) out.push(directive("copyright", text));
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
