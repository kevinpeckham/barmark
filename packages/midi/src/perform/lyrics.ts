/** Lyrics (spec 3.8): each played syllable as MuseScore writes it. */
import type { PlayedLyrics, Syllable } from "barmark";
import { add, cmp, nearest } from "./quarters.js";
import type { PerformedTrack, Quarters } from "./types.js";

/** A syllable's text: elided parts joined by `‿`, a space when it ends its word; null for a held one. */
function textOf(syllable: Syllable): string | null {
	if (syllable.kind === "held") return null;
	return syllable.parts.join("‿") + (syllable.continues ? "" : " ");
}

/** A bar's sung syllables, from the bar at `at`, at their onsets, in time order, verses in order at one time. */
export function lyricsOf(lyrics: PlayedLyrics[], at: Quarters): PerformedTrack["lyrics"] {
	const out: PerformedTrack["lyrics"] = [];
	for (const { verse, syllables } of lyrics)
		for (const s of syllables) {
			const text = textOf(s.syllable);
			// PlayedSyllable.at is in whole notes, a float: four times it, made exact again, is quarters.
			if (text !== null) out.push({ at: add(at, nearest(s.at * 4)), verse, text });
		}
	return out.sort((a, b) => cmp(a.at, b.at) || a.verse - b.verse);
}
