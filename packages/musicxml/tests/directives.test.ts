import { describe, expect, test } from "bun:test";
import { measures, xmlOf } from "./helpers.js";

describe("directives", () => {
	test("tempo is a metronome mark and a sound tempo", () => {
		const [m] = measures(xmlOf("tempo: 120\n| G |"));
		expect(m).toContain(
			"<metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome>",
		);
		expect(m).toContain('<sound tempo="120"/>');
	});
	test("in a compound meter the beat is a dotted quarter, and the sound counts quarters", () => {
		const [m] = measures(xmlOf("time: 6/8, tempo: 60\n| G |"));
		expect(m).toContain(
			"<beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute>",
		);
		expect(m).toContain('<sound tempo="90"/>');
	});
	test("only 6/8, 9/8 and 12/8 are compound (grammar 2.1): a dotted quarter, and the sound ×3/2", () => {
		for (const time of ["6/8", "9/8", "12/8"]) {
			const [m] = measures(xmlOf(`time: ${time}, tempo: 60\n| G |`));
			expect(m).toContain(
				"<metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute></metronome>",
			);
			expect(m).toContain('<sound tempo="90"/>');
		}
	});
	test("every other meter beats in its bottom number, undotted (grammar 2.1)", () => {
		const cases: [string, string, number][] = [
			["15/8", "eighth", 60],
			["6/16", "16th", 30],
			["12/16", "16th", 30],
			["3/8", "eighth", 60],
			["2/4", "quarter", 120],
		];
		for (const [time, unit, quarters] of cases) {
			const [m] = measures(xmlOf(`time: ${time}, tempo: 120\n| G |`));
			expect(m).toContain(
				`<metronome><beat-unit>${unit}</beat-unit><per-minute>120</per-minute></metronome>`,
			);
			expect(m).toContain(`<sound tempo="${quarters}"/>`);
		}
	});
	test("a one-bar meter keeps the time: meter's beat (grammar 2.4)", () => {
		const dotted = "<beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute>";
		for (const chart of [
			"time: 6/8, tempo: 60\n| [2/8] E7 | Am | Dm |",
			"time: 6/8, tempo: 60\n| [3/4] Am | E7 |",
		]) {
			const [m] = measures(xmlOf(chart));
			expect(m).toContain(dotted);
			expect(m).toContain('<sound tempo="90"/>');
		}
		const rit = measures(xmlOf("time: 6/8, tempo: 60\n| C |\ntempo: rit. to 40\n| C | [3/4] D |"));
		expect(rit[2]).toContain('<sound tempo="60"/>');
		const back = measures(
			xmlOf("time: 6/8, tempo: 60\n| C |\ntempo: rit.\n| C |\ntempo: a tempo\n| [3/4] D |"),
		);
		expect(back[2]).toContain('<sound tempo="90"/>');
	});
	test("a new tempo mid-chart is marked on its bar", () => {
		const ms = measures(xmlOf("tempo: 120\n| G | C |\ntempo: 140\n| D |"));
		expect(ms[1]).not.toContain("<metronome>");
		expect(ms[2]).toContain("<per-minute>140</per-minute>");
	});
	test("rit. to 90 is its words, then the target tempo on the change's last bar", () => {
		const ms = measures(xmlOf("tempo: 120\n| G |\ntempo: rit. to 90\n| C | D |"));
		expect(ms[1]).toContain("<words>rit.</words>");
		expect(ms[1]).not.toContain('<sound tempo="90"/>');
		expect(ms[2]).toContain('<sound tempo="90"/>');
		expect(xmlOf("tempo: 120\n| G |\ntempo: accel.\n| C |")).toContain("<words>accel.</words>");
	});
	test("a tempo is its words and the steady tempo again", () => {
		const ms = measures(xmlOf("tempo: 120\n| G |\ntempo: rit.\n| C |\ntempo: a tempo\n| D |"));
		expect(ms[2]).toContain("<words>a tempo</words>");
		expect(ms[2]).toContain('<sound tempo="120"/>');
	});
	test("swing is sound swing; a swing percent sets its ratio", () => {
		const swing = measures(xmlOf("feel: swing\n| G |"))[0];
		expect(swing).toContain(
			"<swing><first>2</first><second>1</second><swing-type>eighth</swing-type></swing>",
		);
		expect(swing).toContain("<words>swing</words>");
		expect(xmlOf("feel: swing 60%\n| G |")).toContain(
			"<swing><first>60</first><second>40</second><swing-type>eighth</swing-type></swing>",
		);
		expect(xmlOf("feel: swing 16\n| G |")).toContain("<swing-type>16th</swing-type>");
		expect(xmlOf("feel: shuffle\n| G |")).toContain("<swing-style>shuffle</swing-style>");
	});
	test("straight is straight, written only when it changes the feel", () => {
		expect(xmlOf("| G |")).not.toContain("<swing>");
		const ms = measures(xmlOf("feel: swing\n| G |\nfeel: straight\n| C |"));
		expect(ms[1]).toContain("<swing><straight/></swing>");
	});
	test("a mid-chart key: or time: is attributes on the next bar", () => {
		const ms = measures(xmlOf("key: G\n| G | C |\nkey: A, time: 3/4\n| A |"));
		expect(ms[1]).not.toContain("<attributes>");
		expect(ms[2]).toContain(
			"<attributes><key><fifths>3</fifths><mode>major</mode></key><time><beats>3</beats>",
		);
	});
});

describe("text lines", () => {
	test("lyric and note lines are words below the next bar", () => {
		const ms = measures(xmlOf("| G |\nHere comes the sun\n### watch for the cue\n| C |"));
		expect(ms[0]).not.toContain('placement="below"');
		expect(ms[1]).toContain(
			'<direction placement="below"><direction-type><words>Here comes the sun</words>',
		);
		expect(ms[1]).toContain('<words font-style="italic">watch for the cue</words>');
	});
	test("text after the last bar goes below the last bar, after its notes", () => {
		const [m = ""] = measures(xmlOf("| G |\nfade out"));
		expect(m).toContain("<words>fade out</words>");
		expect(m.indexOf("fade out")).toBeGreaterThan(m.lastIndexOf("</note>"));
	});
	test("text before the first heading is written before the heading", () => {
		const [m = ""] = measures(xmlOf("title: Lead Sheet Test\n## Verse\n| G |"));
		const heading = m.indexOf('<words font-weight="bold">Verse</words>');
		expect(heading).toBeGreaterThan(-1);
		expect(m.indexOf("title: Lead Sheet Test")).toBeGreaterThan(-1);
		expect(m.indexOf("title: Lead Sheet Test")).toBeLessThan(heading);
	});
	test("text after the heading is written after it", () => {
		const [m = ""] = measures(xmlOf("## Verse\nla la\n| G |"));
		expect(m.indexOf("la la")).toBeGreaterThan(m.indexOf(">Verse</words>"));
	});
	test("text at a section's foot goes below its last bar, after the notes, not the next section's", () => {
		const ms = measures(xmlOf("## Verse\n| G | C |\nWatch\n## Chorus\n| D |"));
		expect(ms[1]).toContain("<words>Watch</words>");
		expect(ms[1]?.indexOf("Watch")).toBeGreaterThan(ms[1]?.lastIndexOf("</note>") ?? 0);
		expect(ms[2]).not.toContain("Watch");
	});
	test("a replay's own lyric lines go below its first bar", () => {
		const ms = measures(
			xmlOf("## V\n| G | C |\nfirst words\n## B\n| D |\n## V\nsecond words\n## End\n| E |"),
		);
		expect(ms[3]).toContain("<words>second words</words>");
		expect(ms[5]).not.toContain("second words");
	});
	test("XML-special characters are escaped", () => {
		const xml = xmlOf(
			`# Rock & Roll <Live>\npart: Gtr = "Lead" & 'Rhythm'\n| "go & <stop>" G |\nDon't stop & <go> "now"`,
		);
		expect(xml).toContain("<work-title>Rock &amp; Roll &lt;Live&gt;</work-title>");
		expect(xml).toContain("<part-name>&quot;Lead&quot; &amp; &apos;Rhythm&apos;</part-name>");
		expect(xml).toContain("<words>go &amp; &lt;stop&gt;</words>");
		expect(xml).toContain("<words>Don&apos;t stop &amp; &lt;go&gt; &quot;now&quot;</words>");
	});
});
