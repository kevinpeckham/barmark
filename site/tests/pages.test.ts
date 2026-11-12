import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { alignChart, chartFromRecording } from "@barmark/listen";
import { exportMidi, importMidi } from "@barmark/midi";
import { perform, secondsAt } from "@barmark/midi/perform";
import { exportMusicXml, importMusicXml } from "@barmark/musicxml";
import { ENGRAVER_CDN_INTEGRITY, ENGRAVER_CDN_URL, ENGRAVER_WASM_INTEGRITY } from "@barmark/score";
import { renderScoreHtml } from "@barmark/score/server";
import { barAt, chartFromDetections, secondsAtBar } from "@barmark/sync";
import * as timingOnly from "@barmark/sync/timing";
import { parseChart, printChart, transposeChart } from "barmark";
import { FILES, LINKS } from "../src/lib/site.ts";
import {
	BINARIES,
	CLI_CI,
	PACKAGES,
	SAMPLE_CHART,
	SYNC_DETECTIONS,
	USE_BINARY,
	USE_CLI,
	USE_LISTEN,
	USE_MIDI,
	USE_MUSICXML,
	USE_PERFORM,
	USE_SCORE_ELEMENT,
	USE_SCORE_ENGRAVER,
	USE_SCORE_SERVER,
	USE_SYNC,
	VITE_CONFIG,
	VITE_SETTINGS,
} from "../src/lib/start.ts";
import { build, page, site } from "./built.ts";

beforeAll(build, 120_000);

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim();

describe("the sample chart Get Started shows", () => {
	test("reads cleanly, as the page says it does", () => {
		const chart = parseChart(SAMPLE_CHART);
		expect(chart.diagnostics).toEqual([]);
		expect(chart.title).toBe("Example Song");
		expect(chart.bars.length).toBe(16);
		expect(chart.sections.map((s) => s.name)).toEqual(["Verse", "Chorus"]);
	});
	test("transposes and prints as the page says", () => {
		expect(transposeChart(SAMPLE_CHART, { to: "E" }).text).toContain("|: E | B | C#m | A :|");
		expect(printChart("| D / A / |")).toBe("| D A |\n");
	});
});

describe("the MusicXML code Get Started shows", () => {
	test("exports the sample chart and imports it back as the page says", () => {
		const exported = exportMusicXml(SAMPLE_CHART);
		if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
		expect(exported.xml).toContain("<score-partwise");
		const imported = importMusicXml(exported.xml);
		expect(imported.text).toStartWith("# Example Song\nkey: D, tempo: 145\n\n## Verse\n");
		expect(USE_MUSICXML).toContain('"# Example Song\\nkey: D, tempo: 145\\n\\n## Verse\\n…"');
		expect(imported.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});
});

describe("the MIDI code Get Started shows", () => {
	test("exports the sample chart with no losses and imports it back as the page says", () => {
		const exported = exportMidi(SAMPLE_CHART);
		if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
		expect(new TextDecoder().decode(exported.bytes.slice(0, 4))).toBe("MThd");
		expect(exported.losses).toEqual([]);
		expect(USE_MIDI).toContain("exported.losses; // []");
		expect(exportMidi(SAMPLE_CHART, { part: "Gtr", tempo: 96 }).ok).toBe(false); // no such part
		const imported = importMidi(exported.bytes);
		expect(imported.diagnostics).toEqual([]);
		const shown = "# Example Song\nkey: D, time: 4/4, tempo: 145\n\n## Verse\n| D | A | Bm | G |\n";
		expect(imported.text).toStartWith(shown);
		expect(USE_MIDI).toContain(`imported.text; // "${shown.replaceAll("\n", "\\n")}…"`);
		expect(USE_MIDI).toContain('import { exportMidi, importMidi } from "@barmark/midi";');
	});
	test("the perform subpath times the sample chart as the page says", () => {
		const p = perform(parseChart(SAMPLE_CHART));
		expect(p.tracks.flatMap((t) => t.notes).length).toBeGreaterThan(0);
		const note = p.tracks[0]?.notes[0];
		if (!note) throw new Error("no notes");
		expect(typeof note.pitch).toBe("number");
		expect(typeof note.velocity).toBe("number");
		expect(secondsAt(p, note.at)).toBe(0);
		const end = secondsAt(p, p.end);
		expect(end).toBeCloseTo((64 * 60) / 145, 9);
		// The digits the snippet shows are the performance's own, truncated, so they can't drift.
		const shown = (Math.floor(end * 100) / 100).toFixed(2);
		expect(USE_PERFORM).toContain(`secondsAt(p, p.end); // ${shown}…: 16 bars of 4/4 at 145`);
		expect(USE_PERFORM).toContain('import { perform, secondsAt } from "@barmark/midi/perform";');
	});
});

/** A seconds-long recording: a click on each beat, louder on one, over the bar's chord as sines. */
function synthRecording(bars: number) {
	const rate = 22050;
	const beat = 0.5; // 120 a minute
	const samples = new Float32Array(Math.round((bars * 4 * beat - 0.05) * rate));
	const chords = [
		[62, 66, 69],
		[57, 61, 64],
		[59, 62, 66],
		[55, 59, 62],
	];
	const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
	let seed = 1;
	const noise = () => {
		seed = (seed * 1103515245 + 12345) % 2 ** 31;
		return seed / 2 ** 31 - 0.5;
	};
	for (let b = 0; b < bars; b++)
		for (let k = 0; k < 4; k++) {
			const gain = k === 0 ? 1 : k === 2 ? 0.6 : 0.4;
			const from = Math.round((b * 4 + k) * beat * rate);
			for (let i = 0; i < beat * rate && from + i < samples.length; i++) {
				const t = i / rate;
				let s = 0;
				for (const m of chords[b % 4] ?? [])
					s += Math.sin(2 * Math.PI * hz(m) * t) + 0.5 * Math.sin(2 * Math.PI * hz(m - 12) * t);
				samples[from + i] = s * 0.15 * Math.exp(-t * 6) * gain + (t < 0.01 ? gain * noise() : 0);
			}
		}
	const labels = ["D:maj", "A:maj", "B:min", "G:maj"];
	const runs = Array.from({ length: bars }, (_, b) => ({
		start: b * 4 * beat,
		end: (b + 1) * 4 * beat,
		label: labels[b % 4] ?? "N",
	}));
	return { samples, runs };
}

describe("the listen code Get Started shows", () => {
	test("builds the chart the page says from a recording, and aligns a chart with it", () => {
		const { samples, runs } = synthRecording(12);
		const built = chartFromRecording({
			samples,
			sampleRate: 22050,
			chords: { runs },
			declared: { meter: "4/4", tempo: 120 },
			title: "Example Song",
		});
		if (!built.ok) throw new Error(built.refusals.map((r) => r.reason).join(", "));
		const { chart, timing, features } = built.value;
		const shown = "# Example Song\ntime: 4/4, tempo: 120\n| D | A | Bm | G |\n";
		expect(chart).toStartWith(shown);
		expect(USE_LISTEN).toContain(`chart; // "${shown.replaceAll("\n", "\\n")}…"`);
		expect(timing.bars.length).toBe(12);
		const text =
			"time: 4/4, tempo: 120\n| D | A | Bm | G |\n| D | A | Bm | G |\n| D | A | Bm | G |\n";
		const aligned = alignChart({ chart: text, features });
		if (!aligned.ok) throw new Error(aligned.refusals.map((r) => r.reason).join(", "));
		expect(aligned.value.timing.bars.length).toBe(12);
		for (const line of [
			"\tsamples,",
			"\tchords: { runs },",
			'\tdeclared: { meter: "4/4", tempo: 120 },',
			'\ttitle: "Example Song",',
			"const { chart, timing, features } = built.value;",
			"alignChart({ chart: text, features })",
			"built.refusals;",
		])
			expect(USE_LISTEN).toContain(line);
	}, 30_000);
	test("refuses, never throws, when it can't read the recording", () => {
		const r = chartFromRecording({
			samples: new Float32Array(10),
			sampleRate: 44100,
			chords: { runs: [] },
			declared: { meter: "4/4", tempo: 120 },
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.refusals.length).toBeGreaterThan(0);
	});
});

describe("the score code Get Started shows", () => {
	test("renderScoreHtml draws the grid and the switch, as the page says, with the font", () => {
		const html = renderScoreHtml(SAMPLE_CHART, {
			theme: "auto",
			fontUrl: "/fonts/Edwin-Roman.otf",
		});
		expect(html).toStartWith("<style>@font-face");
		expect(html).toContain("<barmark-score");
		expect(html).toContain('aria-label="View"');
		expect(html).toContain("Example Song");
		expect(USE_SCORE_SERVER).toContain('import { renderScoreHtml } from "@barmark/score/server";');
	});
	test("the element sample imports the element and opens one chart on the score", () => {
		expect(USE_SCORE_ELEMENT).toContain('import "@barmark/score/element";');
		expect(USE_SCORE_ELEMENT).toContain('<barmark-score view="score"');
	});
	test("the lighter build's sample carries the package's three values, as the README shows them", () => {
		expect(USE_SCORE_ENGRAVER).toContain(`verovio-url="${ENGRAVER_CDN_URL}"`);
		expect(USE_SCORE_ENGRAVER).toContain(`verovio-integrity="${ENGRAVER_CDN_INTEGRITY}"`);
		expect(USE_SCORE_ENGRAVER).toContain(`verovio-wasm-integrity="${ENGRAVER_WASM_INTEGRITY}"`);
		const readme = readFileSync(
			join(dirname(Bun.resolveSync("@barmark/score/package.json", site)), "README.md"),
			"utf8",
		);
		for (const value of [ENGRAVER_CDN_URL, ENGRAVER_CDN_INTEGRITY, ENGRAVER_WASM_INTEGRITY])
			expect(readme).toContain(value);
	});
	test("the Vite settings are the score README's", () => {
		const readme = readFileSync(
			join(dirname(Bun.resolveSync("@barmark/score/package.json", site)), "README.md"),
			"utf8",
		);
		for (const setting of VITE_SETTINGS) {
			expect(readme).toContain(setting);
			expect(VITE_CONFIG).toContain(setting);
		}
	});
});

describe("the sync code Get Started shows", () => {
	test("builds the chart and timing map the page says", () => {
		const { chart, timing, diagnostics } = chartFromDetections(SYNC_DETECTIONS);
		expect(diagnostics).toEqual([]);
		for (const r of SYNC_DETECTIONS.chords.runs)
			expect(USE_SYNC).toContain(`{ start: ${r.start}, end: ${r.end}, label: "${r.label}" }`);
		expect(chart).toBe("# Example Song\ntime: 4/4, tempo: 120\n\n## Verse\n| D | / | A | Bm |\n");
		expect(USE_SYNC).toContain(
			'chart; // "# Example Song\\ntime: 4/4, tempo: 120\\n\\n## Verse\\n| D | / | A | Bm |\\n"',
		);
		if (!timing) throw new Error("no timing map");
		expect(secondsAtBar(timing, 3)).toBe(4);
		expect(USE_SYNC).toContain("secondsAtBar(timing, 3); // 4");
		expect(barAt(timing, 5)).toEqual({ entry: 2, bar: 3, fraction: 0.5 });
		expect(USE_SYNC).toContain("barAt(timing, 5); // { entry: 2, bar: 3, fraction: 0.5 }");
	});
	test("the timing subpath has the lookups the page names, without the builder", () => {
		expect(timingOnly.barAt).toBe(barAt);
		expect(timingOnly.secondsAtBar).toBe(secondsAtBar);
		expect("chartFromDetections" in timingOnly).toBe(false);
	});
});

describe("the commands Get Started shows", () => {
	const bin = join(dirname(Bun.resolveSync("@barmark/cli/package.json", site)), "dist/cli.js");
	const version = JSON.parse(readFileSync(join(site, "package.json"), "utf8")).devDependencies[
		"@barmark/cli"
	];
	/** Runs a line of the snippet with the installed CLI, in a folder holding the sample chart. */
	const run = (line: string, cwd: string) => {
		const args = line
			.replace(/\s+#.*$/, "")
			.split(/\s+/)
			.slice(2); // drop "npx @barmark/cli"
		return Bun.spawnSync(["node", bin, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	};
	const folder = () => {
		const dir = mkdtempSync(join(tmpdir(), "barmark-start-"));
		mkdirSync(join(dir, "songs"));
		writeFileSync(join(dir, "example-song.chart.md"), SAMPLE_CHART);
		writeFileSync(join(dir, "songs/example-song.chart.md"), SAMPLE_CHART);
		return dir;
	};
	// Each starts the CLI several times, the score engraving with Verovio: past bun's 5 s on a busy machine.
	const CLI_TIMEOUT = 60_000;
	test(
		"every line runs, with the npx form",
		() => {
			const lines = USE_CLI.split("\n");
			expect(lines.length).toBeGreaterThan(3);
			const dir = folder();
			for (const line of lines) {
				expect(line).toStartWith("npx @barmark/cli ");
				const result = run(line, dir);
				expect([line, result.exitCode, result.stderr.toString()]).toEqual([line, 0, ""]);
			}
		},
		CLI_TIMEOUT,
	);
	test(
		"check reads the sample chart cleanly, and transpose, render, export and import do what they say",
		() => {
			const dir = folder();
			const line = (command: string) =>
				USE_CLI.split("\n").find((l) => l.includes(` ${command} `)) ?? "";
			expect(run(line("check"), dir).stdout.toString()).toContain("1 file, 0 errors, 0 warnings");
			expect(run(line("transpose"), dir).stdout.toString()).toContain("|: E | B | C#m | A :|");
			run(line("render"), dir);
			expect(existsSync(join(dir, "example-song.html"))).toBe(true);
			const score = USE_CLI.split("\n").find((l) => l.includes(" render --score ")) ?? "";
			expect(score).toContain("--out example-song-score.html");
			expect(run(score, dir).exitCode).toBe(0);
			const page = readFileSync(join(dir, "example-song-score.html"), "utf8");
			expect(page).toContain("<svg");
			expect(page).toContain("Example Song");
			run(line("export"), dir);
			expect(readFileSync(join(dir, "example-song.musicxml"), "utf8")).toContain("<score-partwise");
			expect(run(line("import"), dir).exitCode).toBe(0);
			expect(readFileSync(join(dir, "imported.chart.md"), "utf8")).toContain(
				"| D | A | Bm | G | x2",
			);
		},
		CLI_TIMEOUT,
	);
	test(
		"export --midi writes a MIDI file, and import reads it back as a chart",
		() => {
			const dir = folder();
			const lines = USE_CLI.split("\n");
			const exportLine = lines.find((l) => l.includes(" export --midi ")) ?? "";
			const importLine = lines.find((l) => l.includes(" import example-song.mid ")) ?? "";
			expect(run(exportLine, dir).exitCode).toBe(0);
			const bytes = readFileSync(join(dir, "example-song.mid"));
			expect(bytes.subarray(0, 4).toString()).toBe("MThd");
			const result = run(importLine, dir);
			expect([result.exitCode, result.stderr.toString()]).toEqual([0, ""]);
			expect(readFileSync(join(dir, "from-midi.chart.md"), "utf8")).toContain(
				"## Verse\n| D | A | Bm | G |\n| D | A | Bm | G |",
			);
		},
		CLI_TIMEOUT,
	);
	test("the binaries are the ones the CLI's README names, and the steps are its steps", () => {
		const readme = readFileSync(
			join(dirname(Bun.resolveSync("@barmark/cli/package.json", site)), "README.md"),
			"utf8",
		);
		for (const name of BINARIES) {
			expect(readme).toContain(`\`${name}\``);
			expect(USE_BINARY).toContain(name);
		}
		expect(readme).toContain("xattr -d com.apple.quarantine barmark-darwin-arm64");
		expect(USE_BINARY).toContain("xattr -d com.apple.quarantine barmark-darwin-arm64");
		expect(USE_BINARY).toContain("chmod +x barmark-darwin-arm64");
	});
	test("the CI example pins the version the site installs", () => {
		expect(version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(CLI_CI).toContain(`npx -y @barmark/cli@${version} check --strict --format github`);
		expect(CLI_CI).toContain(`npx -y @barmark/cli@${version} format --check`);
	});
});

describe("Get Started, prerendered", () => {
	const doc = () => page("get-started.html");
	test("has its title and canonical link", () => {
		expect(doc().title).toBe("Get Started · Barmark");
		expect(doc().querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
			`${LINKS.origin}/get-started`,
		);
	});
	test("walks from writing a chart to the parser, the renderer and the element", () => {
		const steps = [...doc().querySelectorAll("main section > h2")].map(text);
		expect(steps).toEqual([
			"The packages",
			"1. Write a chart",
			"2. Read it with the parser",
			"3. Render it as HTML",
			"4. Or use the web component",
			"5. Or show it as a full score",
			"6. Convert to and from MusicXML",
			"7. Hear it as MIDI",
			"8. Check charts from the terminal",
			"9. Sync a chart with a recording",
			"10. Or start from the recording",
		]);
		const page = text(doc().querySelector("main")) ?? "";
		for (const line of [
			"npm install barmark",
			"npm install @barmark/render",
			"npm install @barmark/musicxml",
			"npm install @barmark/sync",
			"npm install @barmark/score",
			"npm install @barmark/midi",
			"npm install @barmark/listen",
			"exportMidi(",
			"importMidi(",
			"@barmark/midi/perform",
			"export --midi",
			"chartFromRecording(",
			"alignChart(",
			"@barmark/sync/timing",
			"xattr -d com.apple.quarantine",
			'import "@barmark/score/element";',
			"<barmark-score",
			"renderScoreHtml(",
			"optimizeDeps",
			"chartFromDetections(",
			"exportMusicXml(",
			"importMusicXml(",
			'import "@barmark/render/element";',
			"<barmark-chart",
			"renderChart(",
			"parseChart(",
			"npx @barmark/cli check",
			"render --score",
			"--width",
			"Verovio-LGPL-3.0.txt",
		])
			expect(page).toContain(line);
		const intro = text(doc().querySelector("main h1")?.nextElementSibling) ?? "";
		expect(intro).toContain("@barmark/score shows the same chart as a full score");
		expect(intro).toContain("@barmark/midi convert charts to and from MusicXML and MIDI");
		expect(intro).toContain("The libraries are ESM");
		expect(intro).toContain("Every package is before 1.0");
	});
	test("lists every package the site installs or documents, each linking its step and its README", () => {
		const pkg = JSON.parse(readFileSync(join(site, "package.json"), "utf8"));
		const ours = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
			(name) => name === "barmark" || name.startsWith("@barmark/"),
		);
		const rows = [...doc().querySelectorAll("#packages ~ table tbody tr")];
		const names = rows.map((row) => text(row.querySelector("th a")));
		expect(names).toHaveLength(9);
		for (const name of ours) expect(names).toContain(name);
		expect(names).toContain("@barmark/engraver"); // loaded from a CDN, never installed
		const ids = new Set([...doc().querySelectorAll("main [id]")].map((el) => el.id));
		for (const row of rows) {
			const [step, readme] = [...row.querySelectorAll("a")].map((a) => a.getAttribute("href"));
			expect(ids.has(step?.slice(1) ?? "")).toBe(true);
			expect(Object.values(LINKS)).toContain(readme as (typeof LINKS)[keyof typeof LINKS]);
		}
		expect(PACKAGES.map((p) => p.name)).toEqual(names as string[]);
	});
	test("labels listen as early, and says the caller declares tempo and meter", () => {
		const listen = text(doc().querySelector("#listen")?.parentElement) ?? "";
		expect(listen).toContain("at 0.1");
		expect(listen).toContain("Stem Shovel");
		expect(listen).toContain("you declare the tempo and meter");
		expect(listen).toContain("a draft for a person to check");
	});
	test("shows the sample chart rendered, and again as a score with its switch", () => {
		expect(doc().querySelector("main barmark-chart template[shadowrootmode=open]")).not.toBeNull();
		const score = doc().querySelector("#score")?.parentElement;
		expect(score?.querySelector("barmark-score template[shadowrootmode=open]")).not.toBeNull();
	});
	test("credits Verovio and its licence beside the score, and links the score's README", () => {
		const score = doc().querySelector("#score")?.parentElement;
		const hrefs = [...(score?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain(LINKS.verovio);
		expect(hrefs).toContain(LINKS.verovioLicense);
		expect(hrefs).toContain(LINKS.scoreReadme);
		expect(text(score)).toContain("LGPL-3.0");
		expect(text(score)).toContain("Vite 8");
	});
});

describe("the FAQ, prerendered", () => {
	const doc = () => page("faq.html");
	test("has its title and canonical link", () => {
		expect(doc().title).toBe("FAQ · Barmark");
		expect(doc().querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
			`${LINKS.origin}/faq`,
		);
	});
	test("answers the questions asked, each with its own link", () => {
		const questions = [...doc().querySelectorAll("main h2[id]")].map(text);
		for (const q of [
			"What is Barmark?",
			"What is Stem Shovel?",
			"Who is behind Barmark?",
			"How is Barmark different from other chord notations?",
			"What is Barmark a good fit for?",
			"Is Barmark open source?",
		])
			expect(questions).toContain(q);
		const ids = [...doc().querySelectorAll("main h2[id]")].map((h) => h.id);
		expect(new Set(ids).size).toBe(ids.length);
		const contents = [...doc().querySelectorAll("main nav a")].map((a) => a.getAttribute("href"));
		expect(contents).toEqual(ids.map((id) => `#${id}`));
	});
	test("names the nine packages, and answers how to check charts without code", () => {
		const what = text(doc().querySelector("#what")?.parentElement) ?? "";
		expect(what).toContain("nine npm packages");
		for (const name of [
			"barmark",
			"@barmark/render",
			"@barmark/score",
			"@barmark/engraver",
			"@barmark/musicxml",
			"@barmark/midi",
			"@barmark/sync",
			"@barmark/listen",
			"@barmark/cli",
		])
			expect(what).toContain(name);
		const cli = doc().querySelector("#cli")?.parentElement;
		expect(text(cli)).toContain("npx @barmark/cli check");
		const hrefs = [...(cli?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain("/get-started#terminal");
		expect(hrefs).toContain(LINKS.songs);
	});
	test("answers what the score is, why it is its own package, what engraves it and how it compares", () => {
		const answer = (id: string) => text(doc().querySelector(`#${id}`)?.parentElement) ?? "";
		expect(text(doc().querySelector("#score"))).toBe("Can Barmark show a chart as sheet music?");
		expect(answer("score")).toContain("Grid / Score switch");
		expect(text(doc().querySelector("#score-package"))).toBe(
			"Why is the score view a separate package?",
		);
		expect(answer("score-package")).toContain("first time a reader presses Score");
		expect(text(doc().querySelector("#verovio"))).toBe("What engraves the score?");
		expect(answer("verovio")).toContain("LGPL-3.0");
		const hrefs = [
			...(doc().querySelector("#verovio")?.parentElement?.querySelectorAll("a") ?? []),
		].map((a) => a.getAttribute("href"));
		expect(hrefs).toEqual([
			LINKS.verovio,
			LINKS.verovioLicense,
			LINKS.engraverNotice,
			LINKS.engraverRelease,
		]);
		expect(text(doc().querySelector("#score-dorico"))).toBe(
			"Does the score match Dorico or MuseScore?",
		);
		expect(answer("score-dorico")).toContain("MusicXML");
		expect(answer("score")).toContain("render --score");
	});
	test("links to Stem Shovel, the code and the licence", () => {
		const hrefs = [...doc().querySelectorAll("main a")].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain(LINKS.stemShovel);
		expect(hrefs).toContain(LINKS.syncReadme);
		expect(hrefs).toContain(LINKS.github);
		expect(hrefs).toContain(LINKS.license);
	});
});

describe("the Syntax Guide's score section", () => {
	const doc = () => page("syntax.html");
	test("follows the guide with a row for each way notation is drawn, and a lead sheet to switch", () => {
		const section = doc().querySelector("#in-the-score")?.parentElement;
		expect(text(doc().querySelector("#in-the-score"))).toBe("In the score");
		expect(section?.querySelectorAll("[data-score-note]").length).toBeGreaterThan(8);
		expect(section?.querySelector("barmark-score template[shadowrootmode=open]")).not.toBeNull();
	});
});

describe("every score on the site", () => {
	// Try It opens on a chord, drawn as a grid; its chart's score is the browser suite's.
	for (const path of ["index.html", "syntax.html", "get-started.html"])
		test(`loads the lighter Verovio from jsDelivr with both digests: ${path}`, () => {
			const scores = [...page(path).querySelectorAll("barmark-score")];
			expect(scores.length).toBeGreaterThan(0);
			for (const score of scores) {
				expect(score.getAttribute("verovio-url")).toBe(ENGRAVER_CDN_URL);
				expect(score.getAttribute("verovio-integrity")).toBe(ENGRAVER_CDN_INTEGRITY);
				expect(score.getAttribute("verovio-wasm-integrity")).toBe(ENGRAVER_WASM_INTEGRITY);
			}
		});
});

describe("the nav", () => {
	test("leads with Get Started and ends the pages with the FAQ", () => {
		const links = [...page("index.html").querySelectorAll("nav a")].map((a) => [
			a.getAttribute("href"),
			text(a),
		]);
		const pages = links.filter(([href]) => href?.startsWith("/") && href !== "/");
		expect(pages).toEqual([
			["/get-started", "Get Started"],
			["/syntax", "Syntax Guide"],
			["/try", "Try It"],
			["/faq", "FAQ"],
		]);
	});
});

describe("the name in prose", () => {
	// Barmark, the notation, is capitalized in text; the package name stays in code.
	for (const path of ["index.html", "syntax.html", "try.html", "get-started.html", "faq.html"])
		test(`${path} writes Barmark with a capital B`, () => {
			const doc = page(path);
			for (const el of doc.querySelectorAll(
				"code, pre, script, style, template, barmark-chart, barmark-score",
			))
				el.remove();
			doc.querySelector("nav a[href='/']")?.remove(); // the wordmark
			const words = [doc.title, doc.querySelector("main")?.textContent ?? ""].join(" ");
			expect(words.match(/\bbarmark\b(?![./-])/g) ?? []).toEqual([]);
		});
});

describe("licences", () => {
	test("the FAQ names both: MIT for the code, CC BY 4.0 for the grammar", () => {
		const doc = page("faq.html");
		const hrefs = [...doc.querySelectorAll("main a")].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain(LINKS.license);
		expect(hrefs).toContain(LINKS.specLicense);
		expect(text(doc.querySelector("#open-source")?.parentElement)).toContain("CC BY 4.0");
	});
	test("the Syntax Guide says it is CC BY 4.0, as the grammar is", () => {
		const doc = page("syntax.html");
		const note = [...doc.querySelectorAll("main p")].find((p) => text(p)?.includes("CC BY 4.0"));
		expect(note).toBeDefined();
		expect([...(note?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toContain(
			LINKS.specLicense,
		);
	});
	test("the FAQ says the Syntax Guide is CC BY 4.0", () => {
		expect(text(page("faq.html").querySelector("#open-source")?.parentElement)).toContain(
			"Syntax Guide",
		);
	});
	for (const path of ["index.html", "faq.html"])
		test(`${path}'s footer links both licences, and credits Verovio with its own`, () => {
			const hrefs = [...page(path).querySelectorAll("footer a")].map((a) => a.getAttribute("href"));
			expect(hrefs).toContain(LINKS.license);
			expect(hrefs).toContain(LINKS.specLicense);
			expect(hrefs).toContain(LINKS.verovioBundled);
			expect(hrefs).toContain(FILES.verovioLgpl);
		});
});
