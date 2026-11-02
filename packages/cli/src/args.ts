/** Flags and positionals, with parseArgs' complaints turned into usage errors. */
import { type ParseArgsConfig, parseArgs } from "node:util";
import { UsageError } from "./io.js";

type Options = NonNullable<ParseArgsConfig["options"]>;

export function parseFlags<T extends Options>(args: string[], options: T) {
	try {
		return parseArgs({ args, options, allowPositionals: true, allowNegative: false, strict: true });
	} catch (error) {
		// Node's own message for this one ends on an unbalanced quote.
		const unknown = /^Unknown option '([^']+)'/.exec(String((error as Error)?.message));
		if (unknown)
			throw new UsageError(
				`unknown flag "${unknown[1]}"; a file name starting with - goes after --`,
			);
		throw new UsageError(
			error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error),
		);
	}
}

/** A flag that takes one of a few values. */
export function oneOf<V extends string>(flag: string, value: string, allowed: readonly V[]): V {
	if ((allowed as readonly string[]).includes(value)) return value as V;
	const list = `${allowed.slice(0, -1).join(", ")} or ${allowed.at(-1)}`;
	throw new UsageError(`--${flag} must be ${list}, not "${value}"`);
}
