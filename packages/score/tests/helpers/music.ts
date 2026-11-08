import type { VerovioToolkit } from "verovio/esm";

export type Music = {
	measures: number;
	staves: number;
	notes: number;
	rests: number;
	harms: number;
	verses: number;
};

const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;
const distinct = (s: string, re: RegExp) => new Set([...s.matchAll(re)].map((m) => m[1])).size;

/** What a score holds, counted from the MEI Verovio reads it into. */
export function musicOf(vrv: VerovioToolkit, xml: string): Music {
	if (!vrv.loadData(xml)) throw new Error("Verovio could not read the MusicXML");
	const mei = vrv.getMEI();
	return {
		measures: count(mei, /<measure[\s>]/g),
		staves: distinct(mei, /<staff\b[^>]*\bn="(\d+)"/g),
		notes: count(mei, /<note[\s>]/g),
		rests: count(mei, /<(?:rest|mRest)[\s>/]/g),
		harms: count(mei, /<harm[\s>]/g),
		verses: distinct(mei, /<verse\b[^>]*\bn="(\d+)"/g),
	};
}
