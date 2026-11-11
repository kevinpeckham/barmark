import type { Credits } from "barmark";

/** "A", "A and B", "A, B and C". */
function names(list: string[]): string {
	if (list.length < 2) return list.join("");
	return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** "Traditional", "Trad.", "Traditional, 16th century": already a credit, so no "Music by". */
const traditional = /^trad(\.|itional\b)/i;

/** The header's credit lines, as a score sets them; the copyright goes to the foot. */
export function creditsText(credits: Credits): string[] {
	const { composer, lyricist, arranger } = credits;
	const lines: string[] = [];
	const asWritten = composer.length === 1 && traditional.test(composer[0] as string);
	if (asWritten && same(composer, lyricist)) lines.push(composer[0] as string);
	else if (composer.length > 0 && same(composer, lyricist))
		lines.push(`Words and music by ${names(composer)}`);
	else {
		if (asWritten) lines.push(composer[0] as string);
		else if (composer.length > 0) lines.push(`Music by ${names(composer)}`);
		if (lyricist.length > 0) lines.push(`Words by ${names(lyricist)}`);
	}
	if (arranger.length > 0) lines.push(`Arranged by ${names(arranger)}`);
	return lines;
}
