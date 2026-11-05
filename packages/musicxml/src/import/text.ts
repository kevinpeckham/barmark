/**
 * Free text an import writes (the title, credits, part names, headings,
 * words, text lines and lyrics), kept to what it is: a line of text never
 * reads as a bar line, a heading or a directive, and words never close
 * their quotes early.
 *
 * barmark has no escape for a text line (grammar 1 classifies a line by its
 * start), so a line that would read as something else gets a leading
 * backslash, markdown's escape, which barmark reads as text and keeps.
 */
import { CREDIT_ROLES, type Credits, type InstrumentName, type Line, parseChart } from "barmark";

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/** What `line` reads as after `header` (the chart's part declarations), and the worst diagnostic on it. */
function probe(line: string, header: string[]): { read: Line | undefined; worst: number } {
	const at = header.length + 1;
	const parsed = parseChart([...header, line, "| C |"].join("\n"));
	const on = parsed.diagnostics.filter((d) => d.line === at);
	return {
		read: parsed.lines.find((l) => l.line === at),
		worst: on.some((d) => d.severity === "error") ? 2 : on.length > 0 ? 1 : 0,
	};
}

/** The first candidate that reads as `wanted` with no diagnostic, else the first that does with warnings alone; null when none does. */
function firstReading(
	candidates: string[],
	header: string[],
	wanted: (read: Line | undefined) => boolean,
): string | null {
	const ok = candidates
		.map((c) => ({ c, ...probe(c, header) }))
		.filter((r) => wanted(r.read) && r.worst < 2);
	return (ok.find((r) => r.worst === 0) ?? ok[0])?.c ?? null;
}

/**
 * A text line saying `text`, escaped only when it would read as something
 * else (a text line that merely warns, `Chorus:`, stays as written); null
 * when there is nothing to say.
 */
export function textLine(text: string, header: string[]): string | null {
	const said = tidy(text);
	if (said === "") return null;
	const isText = (read: Line | undefined) => read?.kind === "text";
	return isText(probe(said, header).read) ? said : `\\${said}`;
}

/** Words for a bar (grammar 2.6): no quote or pipe inside, which would end them; null when empty. */
export function wordsText(text: string): string | null {
	const said = tidy(text.replace(/["“”]/g, "'").replace(/\|/g, "/"));
	return said === "" ? null : `"${said}"`;
}

/** A section heading naming `name` and nothing more: never a repeat (`x2`) or an elision (`->`). */
export function headingLine(name: string, header: string[]): string | null {
	const said = tidy(name);
	if (said === "") return null;
	const broken = said.replace(/->/g, "- >").replace(/→/g, "- >");
	const named = (as: string) => (read: Line | undefined) =>
		read?.kind === "section" && read.name === as && read.repeat === null && !read.elided;
	// Each spelling reads under its own name, so each is tried alone.
	return (
		firstReading([`## ${said}`], header, named(said)) ??
		firstReading([`## ${broken}`], header, named(broken)) ??
		firstReading([`## "${broken}"`], header, named(`"${broken}"`))
	);
}

export function titleLine(title: string | null): string[] {
	const said = tidy(title ?? "");
	return said === "" ? [] : [`# ${said}`];
}

/** The credit lines (grammar 7.5), each role in barmark's order. */
export function creditLines(credits: Credits): string[] {
	return CREDIT_ROLES.flatMap((role) =>
		credits[role].map(tidy).flatMap((value) => (value === "" ? [] : [`${role}: ${value}`])),
	);
}

/** A `part:` line (grammar 7.3); a name that would read as more attributes loses its commas and equals signs. */
export function partLine(label: string, name: string, instrument: InstrumentName | null): string {
	const line = (n: string) =>
		`part: ${label} = ${n}${instrument ? `, instrument: ${instrument}` : ""}`;
	const said = tidy(name) || label;
	const kept = (read: Line | undefined) =>
		read?.kind === "part" && read.name === said && read.label === label;
	return firstReading([line(said)], [], kept) ?? line(tidy(said.replace(/[,=]/g, " ")) || label);
}
