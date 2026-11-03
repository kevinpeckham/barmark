/** Shared by the tests: export or fail, and look inside the XML. */
import { exportMusicXml } from "../src/index.js";
import { validate } from "./schema.js";

/** The chart's MusicXML; throws on an error, and on a file the schema rejects. */
export function xmlOf(text: string, part?: string): string {
	const r = exportMusicXml(text, part ? { part } : {});
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
	const problems = validate(r.xml);
	if (problems.length) throw new Error(`invalid MusicXML:\n${problems.join("\n")}`);
	return r.xml;
}

/** Each <measure> of a part (the first by default), as XML. */
export function measures(xml: string, part = "P1"): string[] {
	const body = xml.split(`<part id="${part}">`)[1]?.split("</part>")[0] ?? "";
	return body.match(/<measure [\s\S]*?<\/measure>/g) ?? [];
}

/** Each <note> of a measure, as XML. */
export const notes = (measure: string) => measure.match(/<note>[\s\S]*?<\/note>/g) ?? [];

/** The text of each <tag> in the XML. */
export const all = (xml: string, tag: string) =>
	[...xml.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([^<]*)</${tag}>`, "g"))].map((m) => m[1]);
