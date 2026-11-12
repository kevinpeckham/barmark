/**
 * The home page's example charts, in the order a reader flips through them.
 * The first is the default, the one the page prerenders. Each chart is
 * `src/lib/examples/<id>.chart.md`, the same text as the repository's
 * `examples/<id>.chart.md` (tests/examples.test.ts holds them equal).
 */
export const EXAMPLES = [
	{
		id: "amazing-grace",
		title: "Amazing Grace",
		credit:
			"“Amazing Grace”: words by John Newton (1779), sung to the traditional American tune New Britain; both are in the public domain. The chart is Barmark's own.",
	},
	{
		id: "greensleeves",
		title: "Greensleeves",
		credit:
			"“Greensleeves”: a traditional English tune of the 16th century, in the public domain. The chart is Barmark's own.",
	},
	{
		id: "blues-in-f",
		title: "Blues in F",
		credit:
			"“Blues in F”: a twelve-bar blues, a form in the public domain. The chart is Barmark's own.",
	},
	{
		id: "when-the-saints",
		title: "When the Saints Go Marching In",
		credit:
			"“When the Saints Go Marching In”: a traditional spiritual, in the public domain. The chart and its arrangement are Barmark's own.",
	},
	{
		id: "peaceful-dreams",
		title: "Peaceful Dreams",
		credit:
			"“Peaceful Dreams” by Kevin Peckham, recorded by Badverbs. © Kevin Peckham, all rights reserved.",
	},
] as const;

export type Example = (typeof EXAMPLES)[number];

/** The example's chart file, in `src/lib/examples/` and the repository's `examples/`. */
export const exampleFile = (example: Example): string => `${example.id}.chart.md`;

/** The example `step` places from `index`, round from the last to the first and back. */
export const flipped = (index: number, step: number): number =>
	(((index + step) % EXAMPLES.length) + EXAMPLES.length) % EXAMPLES.length;
