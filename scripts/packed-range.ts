/**
 * Whether npm users of a bundled library get the code the CLI's binaries
 * bundle: each library's dependency ranges, as packed at its own tag, must
 * admit the local versions of the libraries they name (verify-release.ts).
 */

/** A dependency as bun pm pack writes it: a workspace range takes the dependency's version. */
export function packedRange(spec: string, depVersion: string): string {
	if (!spec.startsWith("workspace:")) return spec;
	const range = spec.slice("workspace:".length);
	if (range === "^" || range === "~") return `${range}${depVersion}`;
	return range === "*" || range === "" ? depVersion : range;
}

/** A problem line when `range` (what `lib` packed at its tag) does not admit `local`, or null. */
export function staleRange(
	lib: { name: string; tag: string },
	dep: string,
	range: string,
	local: string,
): string | null {
	if (Bun.semver.satisfies(local, range)) return null;
	return `${lib.name} at ${lib.tag} depends on ${dep} ${range}, which does not admit the bundled ${local}: release a ${lib.name} patch first (Requires ${dep} ${local})`;
}

/** The stale ranges among a library's dependencies at its tag; `versions` knows the bundled libraries. */
export function staleRanges(
	lib: { name: string; tag: string },
	dependencies: Record<string, string>,
	versions: (name: string) => { atTag: string; local: string } | undefined,
): string[] {
	return Object.entries(dependencies).flatMap(([name, spec]) => {
		const v = versions(name);
		const problem = v && staleRange(lib, name, packedRange(spec, v.atTag), v.local);
		return problem ? [problem] : [];
	});
}

/**
 * A problem line when the CLI's exact pin of `dep` (Verovio, which it imports
 * itself) is not what `lib`'s range at its tag admits: npm users would get two
 * copies, and the binaries one the library never declared. Null when they agree.
 */
export function pinProblem(
	lib: { name: string; tag: string },
	dep: string,
	range: string | undefined,
	pin: string | undefined,
): string | null {
	if (range === undefined)
		return `${lib.name} at ${lib.tag} does not depend on ${dep}, which @barmark/cli pins at ${pin}`;
	if (pin === undefined)
		return `@barmark/cli does not pin ${dep}, which ${lib.name} at ${lib.tag} depends on (${range})`;
	if (Bun.semver.satisfies(pin, range)) return null;
	return `@barmark/cli pins ${dep} ${pin}, which ${lib.name} at ${lib.tag} (${dep} ${range}) does not admit: pin a version both agree on`;
}
