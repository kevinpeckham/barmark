import { describe, expect, test } from "bun:test";
import { COMMANDS, main } from "../src/main.js";
import { fakeIo } from "./io.js";

describe("main", () => {
	test("--version lists @barmark/score, @barmark/midi and Verovio", async () => {
		const io = fakeIo();
		expect(await main(["--version"], io)).toBe(0);
		expect(io.out()).toBe(
			"@barmark/cli 0.1.0 (barmark 9.9.9, @barmark/render 8.8.8, @barmark/musicxml 7.7.7, @barmark/score 5.5.5, @barmark/midi 6.6.6, verovio 4.4.4)\n",
		);
	});
	test("no command prints help to stderr and exits 2", async () => {
		const io = fakeIo();
		expect(await main([], io)).toBe(2);
		expect(io.err()).toContain("Usage: barmark <command>");
		for (const command of ["check", "format", "render", "transpose"])
			expect(io.err()).toContain(command);
	});
	test("--help exits 0 with help on stdout", async () => {
		const io = fakeIo();
		expect(await main(["--help"], io)).toBe(0);
		expect(io.out()).toContain("Usage: barmark <command>");
	});
	test("an unknown command is a usage error", async () => {
		const io = fakeIo();
		expect(await main(["fmt"], io)).toBe(2);
		expect(io.err()).toBe('barmark: unknown command "fmt"; run barmark --help\n');
	});
	test("an unexpected throw is one line, exit 2", async () => {
		const io = fakeIo({
			readStdin: async () => {
				throw new Error("boom");
			},
		});
		COMMANDS.boom = async (_args, io) => {
			await io.readStdin();
			return 0;
		};
		try {
			expect(await main(["boom"], io)).toBe(2);
		} finally {
			delete COMMANDS.boom;
		}
		expect(io.err()).toBe("barmark: boom\n");
		expect(io.err()).not.toContain("    at ");
	});
	test("<command> --help prints that command's flags, exit 0", async () => {
		const flags: Record<string, string[]> = {
			check: ["--strict", "--format"],
			format: ["--write", "--check"],
			render: ["--out", "--theme", "--numerals", "--font-url", "--score", "--width"],
			transpose: ["--to", "--semitones", "--out"],
		};
		for (const [command, names] of Object.entries(flags)) {
			const io = fakeIo();
			expect(await main([command, "--help"], io)).toBe(0);
			expect(io.out()).toContain(`Usage: barmark ${command}`);
			for (const name of names) expect(io.out()).toContain(name);
		}
	});
	test("names inherited from Object are unknown commands, not crashes", async () => {
		for (const argv of [["constructor"], ["toString", "--help"], ["hasOwnProperty", "x"]]) {
			const io = fakeIo();
			expect(await main(argv, io)).toBe(2);
			expect(io.err()).toBe(`barmark: unknown command "${argv[0]}"; run barmark --help\n`);
		}
	});
});
