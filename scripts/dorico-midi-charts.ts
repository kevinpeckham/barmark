/**
 * Small charts for scripts/dorico-midi.ts, each written to put one thing
 * a MIDI file carries in front of Dorico's MIDI import: a pickup, a short
 * bar in 6/8, tempo changes, a key change, pushes, repeats and a D.C.,
 * several parts with a tacet one, and lyrics. Every one exports cleanly
 * (packages/midi/tests/dorico-compare.test.ts).
 */
export const DORICO_CHARTS: [string, string][] = [
	["pickup", "# Pickup\nkey: F, time: 3/4, tempo: 100\n| [1/4] C7 | F | Bb | C7 | F |\n"],
	[
		"short-bar-6-8",
		"# Short Bar\nkey: Am, time: 6/8, tempo: 60\n| [2/8] E7 | Am | Dm | E7 | Am |\n",
	],
	[
		"tempo-changes",
		"# Tempo Changes\nkey: C, time: 4/4, tempo: 120\n| C | F | G | C |\ntempo: 90\n| Am | F | G | C |\ntempo: rit. to 60\n| F | G | C | C |\n",
	],
	[
		"key-change",
		"# Key Change\nkey: C, time: 4/4, tempo: 110\n| C | G | Am | F |\nkey: D\n| D | A | Bm | G |\n",
	],
	["pushes", "# Pushes\nkey: G, time: 4/4, tempo: 120\n| G | C <D | <G | C <<D | G |\n"],
	[
		"repeats-dc",
		"# Repeats\nkey: Bb, time: 4/4, tempo: 120\n|: Bb | Eb :| x2\n| F7 | Bb | Fine | Gm | C7 | F7 | D.C. al Fine |\n",
	],
	[
		"parts-tacet",
		"# Band\npart: Pno = Piano\npart: Bass = Acoustic Bass\npart: Gtr = Electric Guitar\nkey: E, time: 4/4, tempo: 100\n\n## Intro\n| E | A | B7 | E |\n\n## Verse\nPno  | E | A | E  | B7 |\nBass | E | A | E  | B7 |\nPno  | E | A | B7 | E  |\n",
	],
	[
		"lyrics",
		"# Lyrics\nkey: C, time: 4/4, tempo: 96\n| {C4}:Twin- {C4}:kle {G4}:twin- {G4}:kle | {A4}:lit- {A4}:tle {G4}:star / |\nlyrics 2: | Up a- bove the | world so high / |\n",
	],
];
