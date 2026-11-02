/** The charts a command reads: named files, every chart under named folders, and stdin. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Io, UsageError } from "./io.js";

export type Chart = { path: string; text: string };

const STDIN = "<stdin>";

/**
 * Every `*.chart.md` under a folder, sorted, skipping node_modules and dot-folders.
 * Symlinks are skipped too, so `format --write` never rewrites a file outside the folder.
 */
function chartsUnder(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isSymbolicLink()) continue;
		if (entry.isDirectory()) {
			if (entry.name !== "node_modules" && !entry.name.startsWith("."))
				found.push(...chartsUnder(path));
		} else if (entry.name.endsWith(".chart.md")) found.push(path);
	}
	return found.sort();
}

/** The files a path names: itself, or the charts under it. */
function filesFor(path: string, io: Io, folders: boolean): string[] {
	const full = resolve(io.cwd, path);
	const stat = statSync(full, { throwIfNoEntry: false });
	if (!stat) throw new UsageError(`cannot read ${path}`);
	if (!stat.isDirectory()) return [full];
	if (!folders) throw new UsageError(`${path} is a folder`);
	const charts = chartsUnder(full);
	if (!charts.length) throw new UsageError(`no charts found in ${path}`);
	return charts;
}

function readText(full: string, shown: string): string {
	try {
		return readFileSync(full, "utf8");
	} catch {
		throw new UsageError(`cannot read ${shown}`);
	}
}

export async function readCharts(
	paths: string[],
	io: Io,
	opts: { folders: boolean },
): Promise<Chart[]> {
	if (!paths.length) throw new UsageError("no chart given");
	const charts: Chart[] = [];
	const seen = new Set<string>();
	for (const path of paths) {
		if (path === "-") {
			if (seen.has(STDIN)) throw new UsageError("- (stdin) given twice");
			seen.add(STDIN);
			charts.push({ path: STDIN, text: await io.readStdin() });
			continue;
		}
		for (const full of filesFor(path, io, opts.folders)) {
			if (seen.has(full)) continue;
			seen.add(full);
			const shown = full === resolve(io.cwd, path) ? path : relative(io.cwd, full);
			charts.push({ path: shown, text: readText(full, shown) });
		}
	}
	return charts;
}
