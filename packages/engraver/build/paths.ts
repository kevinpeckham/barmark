/**
 * The leaked-path scan: an absolute build path (a home, temp, opt, macOS or
 * runner directory, or one of the given literals) left in a compiled file.
 * Emscripten's virtual filesystem paths (`/home/web_user`, a bare `/home` or
 * `/tmp`) are not build paths.
 */
const ABSOLUTE = /\/(?:home|tmp|opt|Users|__w)\/[A-Za-z0-9_.+-][^\0"'\s]*/g;
const VIRTUAL = "/home/web_user";

export function absolutePaths(bytes: Uint8Array, literals: string[]): string[] {
	const text = new TextDecoder("latin1").decode(bytes);
	const hits = new Set<string>();
	for (const [match] of text.matchAll(ABSOLUTE)) if (!match.startsWith(VIRTUAL)) hits.add(match);
	for (const literal of literals) if (literal !== "" && text.includes(literal)) hits.add(literal);
	return [...hits].sort();
}

if (import.meta.main) {
	const files: string[] = [];
	const literals: string[] = [];
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (arg === "--literal") literals.push(args[++i] ?? "");
		else files.push(arg);
	}
	let found = false;
	for (const file of files) {
		const hits = absolutePaths(new Uint8Array(await Bun.file(file).arrayBuffer()), literals);
		for (const hit of hits) console.error(`${file}: ${hit}`);
		if (hits.length > 0) found = true;
	}
	if (files.length === 0) {
		console.error("usage: bun paths.ts <file>... [--literal <path>]...");
		process.exit(2);
	}
	process.exit(found ? 1 : 0);
}
