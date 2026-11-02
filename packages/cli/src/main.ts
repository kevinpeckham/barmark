/** The barmark command: dispatch to a subcommand, and turn every failure into one line and an exit code. */
import { HELP } from "./help.js";
import { type Io, UsageError } from "./io.js";

export type Command = (args: string[], io: Io) => Promise<number>;

/** Each subcommand by name. */
export const COMMANDS: Record<string, Command> = {};

export async function main(argv: string[], io: Io): Promise<number> {
	const [name, ...args] = argv;
	if (name === "--version" || name === "-v") {
		const { cli, barmark, render } = io.versions;
		io.stdout(`@barmark/cli ${cli} (barmark ${barmark}, @barmark/render ${render})\n`);
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
	const command = COMMANDS[name];
	try {
		if (!command) throw new UsageError(`unknown command "${name}"; run barmark --help`);
		return await command(args, io);
	} catch (error) {
		io.stderr(`barmark: ${error instanceof Error ? error.message : String(error)}\n`);
		return 2;
	}
}
