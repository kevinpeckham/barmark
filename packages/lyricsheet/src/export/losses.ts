import type { PlayedBar } from "barmark";
import type { LyricsheetLoss, LyricsheetLossCode } from "./types.js";

const SHOWN = 10;

/** One code's bars: each written number once, at the lowest played bar it was seen at. */
type Group = {
	/** The message given with the lowest bar (or the first, while no bar has been given). */
	message: string;
	lowest: PlayedBar | null;
	bars: Map<number, PlayedBar>;
};

const name = (written: number) => (written === 0 ? "the pickup" : String(written));

/** Where a loss is: "bar 5", "the pickup", or "3 bars: 2, 5, 9" (at most ten named). */
function barsText(written: number[]): string {
	const [only] = written;
	if (written.length === 1 && only !== undefined) return only === 0 ? "the pickup" : `bar ${only}`;
	const shown = written.slice(0, SHOWN).map(name).join(", ");
	return `${written.length} bars: ${shown}${written.length > SHOWN ? ", …" : ""}`;
}

/** Losses grouped by code: one each, at its lowest bar, saying how many bars. */
export class Losses {
	private readonly groups = new Map<LyricsheetLossCode, Group>();

	add(code: LyricsheetLossCode, message: string, bar?: PlayedBar): void {
		const group = this.groups.get(code) ?? { message, lowest: null, bars: new Map() };
		this.groups.set(code, group);
		if (!bar) return;
		const seen = group.bars.get(bar.written);
		if (!seen || bar.index < seen.index) group.bars.set(bar.written, bar);
		if (!group.lowest || bar.index < group.lowest.index) {
			group.lowest = bar;
			group.message = message;
		}
	}

	list(): LyricsheetLoss[] {
		return [...this.groups].map(([code, g]) => {
			const first = g.lowest;
			if (!first) return { code, message: g.message };
			const written = [...g.bars.keys()].sort((a, b) => a - b);
			return {
				code,
				message: `${g.message} in ${barsText(written)}`,
				bar: first.index,
				written: first.written,
			};
		});
	}
}
