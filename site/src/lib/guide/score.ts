/**
 * The Syntax Guide's "In the score" rows: how notation is drawn when a reader
 * switches a chart to Score (@barmark/score, which engraves the chart's
 * MusicXML export). tests/score-notes.test.ts exports and engraves every
 * example and checks the MusicXML for what each row says.
 */
export type ScoreNote = {
	/** kebab-case, unique */
	id: string;
	/** what you write */
	syntax: string;
	/** what the score draws, one or two plain sentences */
	drawn: string;
	/** a small chart */
	example: string;
};

/** The lead sheet the section shows rendered, with its Grid / Score switch. */
export const SCORE_EXAMPLE = `# A lead sheet
part: Vox = Voice, instrument: voice
key: G, time: 3/4, tempo: 90

## Verse
Vox     | G                   | C                    | D                | G           |
Vox.Mel | {G4}:Down / {B4}:by | {C5}:the / {E5}:riv- | {D5}:er / {A4}:I | {G4}:go / / |
`;

export const SCORE_NOTES: ScoreNote[] = [
	{
		id: "chords",
		syntax: "| D | A | Bm G |",
		drawn:
			"Each chord is a chord symbol over rhythm slashes, one slash a beat. A bar of two chords puts each over its own beats.",
		example: "| D | A | Bm G |",
	},
	{
		id: "hold-simile",
		syntax: "/   %",
		drawn: "A slash keeps the slashes going under the chord; a % writes its bar out again.",
		example: "| G / D / | % |",
	},
	{
		id: "silence",
		syntax: "N.C.   --",
		drawn: "N.C. is written over the slashes, as a chord symbol is; -- is a rest.",
		example: "| D | N.C. | -- | A |",
	},
	{
		id: "notes",
		syntax: "{E2}   Cmaj7{E3 G3 B3 C4}",
		drawn:
			"Note sets are notes on the staff, at the octave written. A voicing is its notes, with the chord symbol above them.",
		example: "| {E2} | {E2 B2 E3} | Cmaj7{E3 G3 B3 C4} |",
	},
	{
		id: "marks",
		syntax: ">D   ^G   <A",
		drawn:
			"An accent is an accent mark, a hit an accent with a staccato dot, and a push writes the chord an eighth early, tied into its bar.",
		example: "| >D / ^G / | <A |",
	},
	{
		id: "structure",
		syntax: "|: :|   |1 |2   Segno   D.S. al Fine   ...",
		drawn:
			"Repeats, endings, Segno, Fine, D.S. and D.C. and fermatas are the score's own signs and words.",
		example: "| Segno | D | A |\n|: G | D |\n|1 Bm :|\n|2 A | Fine | E | ... | D.S. al Fine |",
	},
	{
		id: "sections-directives",
		syntax: "## Verse   key: D, time: 3/4, tempo: 96",
		drawn:
			"A section's name is printed over its first bar, and a heading that replays a section writes its bars out again. The key, meter and tempo are the key and time signatures and a metronome mark.",
		example: "key: D, time: 3/4, tempo: 96\n\n## Verse\n| D | A |\n\n## Verse",
	},
	{
		id: "parts",
		syntax: "part: Gtr = Guitar   Gtr | … |",
		drawn:
			"Each part is a staff of its own, named, in score order. Every part plays a tutti bar line; a part left out of a system rests.",
		example:
			"part: Gtr = Guitar\npart: Bs = Bass\n\n| G | C |\nGtr | D | G |\nBs  | {D2} | {G1} |\nGtr | C | D |",
	},
	{
		id: "instruments",
		syntax: "instrument: piano   Pno.RH   Pno.LH",
		drawn:
			"A keyboard gets a grand staff, its first line on the upper staff and its second on the lower. A guitar reads in the octave treble clef, a bass in the bass clef, and a transposing instrument is written at its own pitch, chord symbols included.",
		example:
			"part: Pno = Piano, instrument: piano\npart: Gtr = Guitar, instrument: electric guitar\npart: Bs = Bass, instrument: electric bass\npart: Tpt = Trumpet, instrument: trumpet in Bb\n\nPno.RH | C{E4 G4 C5} | G{D4 G4 B4} |\nPno.LH | {C3} | {G2} |\nGtr    | C | G |\nBs     | {C2} | {G1} |\nTpt    | C | G |",
	},
	{
		id: "melody",
		syntax: "Vox.Mel | {G4}:la |",
		drawn:
			"A melody line is notes, with its syllables as lyrics under them and the chords of the line above it over the staff.",
		example:
			"part: Vox = Voice, instrument: voice\n\nVox     | G | C |\nVox.Mel | {G4}:la / {B4}:la / | {C5}:la |",
	},
	{
		id: "lyric-rows",
		syntax: "lyrics: | Down / by the |",
		drawn:
			"A lyrics row with no one to sing it is a one-line staff of rhythm slashes under the chords, carrying its words.",
		example: "        | C             | F         |\nlyrics: | Down / by the | riv- / er |",
	},
];
