/** Validate MusicXML against the vendored MusicXML 4.0 XSD with xmllint (libxml2-utils). */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const XSD = join(import.meta.dir, "schema/musicxml.xsd");

/** xmllint's errors for the document, or [] when it is valid. */
export function validate(xml: string): string[] {
	const dir = mkdtempSync(join(tmpdir(), "musicxml-"));
	const file = join(dir, "score.musicxml");
	writeFileSync(file, xml);
	// --nonet: the doctype names a remote DTD; validation is against the schema only.
	const r = Bun.spawnSync(["xmllint", "--noout", "--nonet", "--schema", XSD, file], {
		stdout: "pipe",
		stderr: "pipe",
	});
	rmSync(dir, { recursive: true, force: true });
	if (r.exitCode === 0) return [];
	return r.stderr
		.toString()
		.split("\n")
		.filter((l) => l && !l.endsWith("validates") && !l.endsWith("fails to validate"));
}
