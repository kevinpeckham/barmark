/**
 * Text in a MIDI file (spec 5.1): UTF-8 when the bytes are valid UTF-8,
 * else Latin-1; control characters removed; cut at 200 characters with "…".
 */

/** The build's `lib` is ESNext alone, so the platform's TextDecoder is typed here (FINDINGS, 2026-11-05). */
const platform = globalThis as unknown as {
	TextDecoder: new (
		label: string,
		options: { fatal: boolean },
	) => { decode(bytes: Uint8Array): string };
};
const utf8 = new platform.TextDecoder("utf-8", { fatal: true });

const MAX_CHARACTERS = 200;
/** C0, DEL and C1. */
const CONTROL = /\p{Cc}/gu;

function latin1(data: Uint8Array): string {
	let text = "";
	for (const byte of data) text += String.fromCharCode(byte);
	return text;
}

function decoded(data: Uint8Array): string {
	try {
		return utf8.decode(data);
	} catch {
		return latin1(data);
	}
}

export function decodeText(data: Uint8Array): string {
	const text = decoded(data).replace(CONTROL, "");
	const characters = Array.from(text);
	if (characters.length <= MAX_CHARACTERS) return text;
	return `${characters.slice(0, MAX_CHARACTERS - 1).join("")}…`;
}
