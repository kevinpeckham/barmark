/**
 * The CLI's binaries bundle the libraries' code from the checkout, and two
 * places refuse a CLI release while one has changed since its own tag:
 * scripts/verify-release.ts (before tagging) and the release workflow (on
 * the tag). They list the libraries separately, and the lists have drifted
 * once (score was in the script only): this holds them to each other.
 * Here because the root `bun test` runs packages/ only.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** `key: ["src", "fonts"]` rows of the script's RELEASED_CODE table. */
function scriptRows(): Map<string, string[]> {
	const table = /const RELEASED_CODE = \{([^}]*)\}/.exec(read("scripts/verify-release.ts"))?.[1];
	const rows = new Map<string, string[]>();
	for (const row of (table ?? "").matchAll(/(\w+): \[([^\]]*)\]/g))
		rows.set(
			row[1] as string,
			[...(row[2] as string).matchAll(/"([^"]+)"/g)].map((folder) => folder[1] as string),
		);
	return rows;
}

/** The workflow step's loop: its names, and the extra folders it adds for one of them. */
function workflowRows(): Map<string, string[]> {
	const workflow = read(".github/workflows/release.yml");
	const names = /for dep in ([\w ]+); do/.exec(workflow)?.[1]?.split(" ") ?? [];
	const rows = new Map<string, string[]>(names.map((name) => [name, ["src"]]));
	for (const extra of workflow.matchAll(
		/\[ "\$dep" = (\w+) \] && paths\+=\(packages\/\w+\/(\w+)\)/g,
	))
		rows.get(extra[1] as string)?.push(extra[2] as string);
	return rows;
}

const sorted = (rows: Map<string, string[]>) =>
	[...rows].map(([name, folders]) => `${name}: ${[...folders].sort().join(", ")}`).sort();

test("the release workflow checks the libraries verify-release.ts checks", () => {
	expect(scriptRows().size).toBeGreaterThan(0);
	expect(sorted(workflowRows())).toEqual(sorted(scriptRows()));
});
