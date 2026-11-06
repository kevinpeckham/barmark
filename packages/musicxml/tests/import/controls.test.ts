import { expect, test } from "bun:test";
import { importMusicXml } from "../../src/index.js";

const ESC = "\u001b[31m";
const doc = (name: string, words: string, number: string) =>
	`<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>${name}</part-name></score-part></part-list><part id="P1"><measure number="${number}"><direction placement="above"><direction-type><words>${words}</words></direction-type></direction><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note><attributes><divisions>1</divisions></attributes></measure></part></score-partwise>`;

test("control characters in names, words and numbers never reach the chart or diagnostics", () => {
	const r = importMusicXml(doc(`Pi${ESC}ano`, `Verse${ESC}x`, `1${ESC}`));
	const everything = JSON.stringify([r.text, r.diagnostics]);
	expect(everything).not.toMatch(/(?![\t\n\r])\p{Cc}/u);
	expect(everything).toContain("[31m");
});
