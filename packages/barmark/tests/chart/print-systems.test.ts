import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";
import { printChart, printPart } from "../../src/chart/print.js";
import { transposeChart } from "../../src/chart/transpose.js";
import { MORNING_SONG } from "./morning-song.js";

const TWO = "part: Gtr = Guitar\npart: Pno = Piano\n";
const body = (text: string) => printChart(text).split("\n").slice(2).join("\n");

describe("printing systems (grammar 7.4, section 8)", () => {
	test("a system prints in score order with its pipes lined up", () => {
		expect(body(`${TWO}Pno | G/B | C | Em | D |\nGtr | G | C | G | D |`)).toBe(
			"Gtr | G   | C | G  | D |\nPno | G/B | C | Em | D |\n",
		);
	});
	test("labels pad to the widest declared label", () => {
		const text = "part: G = Guitar\npart: Keys = Piano\nG | D |\nKeys | A |";
		expect(printChart(text).split("\n").slice(2, 4)).toEqual(["G    | D |", "Keys | A |"]);
	});
	test("tutti lines have no label column, and labels print as declared", () => {
		expect(body(`${TWO}| G |\ngtr | D |`)).toBe("| G |\nGtr | D |\n");
	});
	test("repeat marks and endings stay attached", () => {
		expect(body(`${TWO}Gtr |: G | Cmaj7 :| x2\nPno |: Em | C :| x2`)).toBe(
			"Gtr |: G  | Cmaj7 :| x2\nPno |: Em | C     :| x2\n",
		);
	});
	test("a system with an error prints as written, unsorted", () => {
		const text = `${TWO}Pno | G | C_ |\nGtr | G   | C |`;
		expect(body(text)).toBe("Pno | G | C_ |\nGtr | G | C |\n");
	});
	test.each([
		["Morning Song", MORNING_SONG],
		["an errored system", `${TWO}Pno | G | C_ |\nGtr | G   | C |`],
		["a dropped line", `${TWO}Gtr | G | C | D |\nPno | G |`],
	])("printing is stable: %s", (_, text) => {
		const once = printChart(text);
		expect(printChart(once)).toBe(once);
	});
	test("a printed chart means the same", () => {
		const a = parseChart(MORNING_SONG);
		const b = parseChart(printChart(MORNING_SONG));
		expect(b.bars.map((x) => x.parts)).toEqual(
			a.bars.map((x) => x.parts?.map((p) => p && { ...p, line: expect.any(Number) })),
		);
	});
});

describe("printPart", () => {
	test("one part as a single-part chart", () => {
		expect(printPart(MORNING_SONG, "Pno")).toBe(`# Morning Song
part: Pno = Piano
key: G

## Intro
| G | C | G | D |

## Verse
| G/B | C | Em | D |
| N.C. | N.C. | N.C. | N.C. |

## Chorus
|: C | G | D | G :|
`);
		expect(parseChart(printPart(MORNING_SONG, "Pno") ?? "").diagnostics).toEqual([]);
	});
	test("an undeclared label has none", () => {
		expect(printPart(MORNING_SONG, "Bass")).toBeNull();
	});
});

describe("transposing several parts", () => {
	test("every part moves and the system stays aligned", () => {
		const out = transposeChart(`key: G\n${TWO}Gtr | G | C |\nPno | Em | D |`, { to: "A" });
		expect(out.text.split("\n").slice(3, 5)).toEqual(["Gtr | A   | D |", "Pno | F#m | E |"]);
	});
});
