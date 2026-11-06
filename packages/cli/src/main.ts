/** The barmark command: dispatch to a subcommand, and turn every failure into one line and an exit code. */
import { check } from "./check.js";
import { exportCommand } from "./export.js";
import { format } from "./format.js";
import { COMMAND_HELP, HELP } from "./help.js";
import { importCommand } from "./import.js";
import { type Io, UsageError } from "./io.js";
import { part } from "./part.js";
import { render } from "./render.js";
import { transpose } from "./transpose.js";

export type Command = (args: string[], io: Io) => Promise<number>;

/** Each subcommand by name. */
export const COMMANDS: Record<string, Command> = {
	check,
	export: exportCommand,
	format,
	import: importCommand,
	part,
	render,
	transpose,
};

export async function main(argv: string[], io: Io): Promise<number> {
	const [name, ...args] = argv;
	if (name === "--version" || name === "-v") {
		const { cli, barmark, render, musicxml } = io.versions;
		io.stdout(
			`@barmark/cli ${cli} (barmark ${barmark}, @barmark/render ${render}, @barmark/musicxml ${musicxml})\n`,
		);
		return 0;
	}
	if (name === "--help" || name === "-h") {
		io.stdout(HELP);
		return 0;
	}
	if (name === undefined) {
		io.stderr(HELP);
		return 2;
	}
	// Own keys only: "constructor" and friends are not commands.
	const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
	const help = Object.hasOwn(COMMAND_HELP, name) ? COMMAND_HELP[name] : undefined;
	if (help && (args.includes("--help") || args.includes("-h"))) {
		io.stdout(help);
		return 0;
	}
	try {
		if (!command) throw new UsageError(`unknown command "${name}"; run barmark --help`);
		return await command(args, io);
	} catch (error) {
		io.stderr(`barmark: ${error instanceof Error ? error.message : String(error)}\n`);
		return 2;
	}
}
