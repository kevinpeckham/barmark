/** Diagnostics as lines: plain text for people and editors, workflow commands for GitHub. */
import type { ChartDiagnostic } from "barmark";

/**
 * A diagnostic's message, ending with what to write instead when the parser
 * has a suggestion the message does not already spell out.
 */
const sentence = (d: ChartDiagnostic) =>
	d.suggestion && !d.message.includes(d.suggestion)
		? `${d.message} (write ${d.suggestion})`
		: d.message;

export function textLine(path: string, d: ChartDiagnostic): string {
	return `${path}:${d.line}: ${d.severity}: ${sentence(d)}`;
}

/** GitHub's workflow-command escaping for a message. */
const escapeData = (text: string) =>
	text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

export function githubLine(path: string, d: ChartDiagnostic): string {
	const file = escapeData(path).replace(/:/g, "%3A").replace(/,/g, "%2C");
	return `::${d.severity} file=${file},line=${d.line}::${escapeData(sentence(d))}`;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function summary(files: number, errors: number, warnings: number): string {
	return `${count(files, "file")}, ${count(errors, "error")}, ${count(warnings, "warning")}`;
}
