/**
 * The export's running budget (`MusicXmlOptions.maxLength`): each measure is
 * charged as it is written, and the export stops at the first one past the
 * limit, so a short chart whose repeats would write gigabytes never builds
 * more than the limit. An estimate made beforehand chases the writer; this
 * bounds the writer itself.
 */
export class TooLarge extends Error {}

export type Budget = { left: number };

/** Charges `xml` to the budget, if there is one, and gives it back; past the limit, throws `TooLarge` (caught by the export). */
export function spend(budget: Budget | undefined, xml: string): string {
	if (!budget) return xml;
	budget.left -= xml.length;
	if (budget.left < 0) throw new TooLarge();
	return xml;
}
