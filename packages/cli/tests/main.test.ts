import { describe, expect, test } from "bun:test";
import { COMMANDS, main } from "../src/main.js";
import { fakeIo } from "./io.js";

describe("main", () => {
	test("--version prints all three versions", async () => {
		const io = fakeIo();
		expect(await main(["--version"], io)).toBe(0);
		expect(io.out()).toBe("@barmark/cli 0.1.0 (barmark 9.9.9, @barmark/render 8.8.8)\n");
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
});
