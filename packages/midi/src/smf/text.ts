/**
 * Text in a MIDI file (spec 5.1): UTF-8 when the bytes are valid UTF-8,
 * else windows-1252 (Claude's ruling, 2026-11-08: its 0x80–0x9F are the
 * curly quotes, dashes and euro Windows programs write); control
 * characters removed; cut at 200 characters with "…".
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
/** C0, DEL and C1. */
const CONTROL = /\p{Cc}/gu;

function decoded(data: Uint8Array): string {
	try {
		return utf8.decode(data);
	} catch {
		return windows1252.decode(data);
	}
}

export function decodeText(data: Uint8Array): string {
	const text = decoded(data).replace(CONTROL, "");
	// Fewer code units than the cut: fewer code points too.
	if (text.length <= MAX_CHARACTERS) return text;
	// The first 199 code points, then "…" if a 201st follows; one pass that stops there.
	let kept = "";
	let count = 0;
	for (const character of text) {
		count++;
		if (count > MAX_CHARACTERS) return `${kept}…`;
		if (count < MAX_CHARACTERS) kept += character;
	}
	return text;
}
