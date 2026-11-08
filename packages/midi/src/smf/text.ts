/**
 * Text in a MIDI file (spec 5.1): UTF-8 when the bytes are valid UTF-8,
 * else windows-1252 (Claude's ruling, 2026-11-08: its 0x80–0x9F are the
 * curly quotes, dashes and euro Windows programs write). A newline or a
 * tab becomes a space, then the other control characters go, and so do
 * line and paragraph separators, bidi controls and zero-width spaces
 * (Claude's ruling, 2026-11-08: "Intro\n| C |" is "Intro | C |"). Cut at
 * 200 characters with "…", never between a character and its combining
 * marks.
 */

/** The build's `lib` is ESNext alone, so the platform's TextDecoder is typed here (FINDINGS, 2026-11-05). */
const platform = globalThis as unknown as {
	TextDecoder: new (
		label: string,
		options: { fatal: boolean },
	) => { decode(bytes: Uint8Array): string };
};
const utf8 = new platform.TextDecoder("utf-8", { fatal: true });
/** Never fails: the five bytes windows-1252 leaves unassigned decode as C1 controls, then removed. */
const windows1252 = new platform.TextDecoder("windows-1252", { fatal: false });

const MAX_CHARACTERS = 200;
/** Tab, line feed, vertical tab, form feed, carriage return. */
const SPACING = /[\t\n\v\f\r]/g;
/** C0, DEL and C1; line and paragraph separators; bidi embeddings, overrides and isolates; the zero-width space. */
const HIDDEN = /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069\u200b]/gu;
/** Characters as a reader sees them: a base and its combining marks, a flag, an emoji sequence. */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function decoded(data: Uint8Array): string {
	try {
		return utf8.decode(data);
	} catch {
		return windows1252.decode(data);
	}
}

/** Whether `text` has more than `MAX_CHARACTERS` code points: a pass that stops there. */
function longer(text: string): boolean {
	let count = 0;
	for (const _ of text) if (++count > MAX_CHARACTERS) return true;
	return false;
}

export function decodeText(data: Uint8Array): string {
	const text = decoded(data).replace(SPACING, " ").replace(HIDDEN, "");
	// Fewer code units than the cut: fewer code points too.
	if (text.length <= MAX_CHARACTERS || !longer(text)) return text;
	// Whole characters up to 199 code points, then "…"; the segmenter is lazy, so this stops there.
	let kept = "";
	let count = 0;
	for (const { segment } of graphemes.segment(text)) {
		count += [...segment].length;
		if (count >= MAX_CHARACTERS) break;
		kept += segment;
	}
	return `${kept}…`;
}
