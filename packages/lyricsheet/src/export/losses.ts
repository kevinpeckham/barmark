import type { PlayedBar } from "barmark";
import type { LyricsheetLoss, LyricsheetLossCode } from "./types.js";

const SHOWN = 10;

type Group = { message: string; bars: PlayedBar[] };

/** Where a loss is: "bar 5", or "3 bars: 2, 5, 9" (at most ten named). */
function barsText(bars: PlayedBar[]): string {
	if (bars.length === 1) return `bar ${bars[0]?.written}`;
	const shown = bars
		.slice(0, SHOWN)
		.map((b) => b.written)
		.join(", ");
	return `${bars.length} bars: ${shown}${bars.length > SHOWN ? ", …" : ""}`;
}

/** Losses grouped by code: one each, at its lowest bar, saying how many bars. */
export class Losses {
	private readonly groups = new Map<LyricsheetLossCode, Group>();

	add(code: LyricsheetLossCode, message: string, bar?: PlayedBar): void {
		const group = this.groups.get(code) ?? { message, bars: [] };
		this.groups.set(code, group);
		if (bar && !group.bars.some((b) => b.index === bar.index)) group.bars.push(bar);
	}

	list(): LyricsheetLoss[] {
		return [...this.groups].map(([code, g]) => {
			const bars = [...g.bars].sort((a, b) => a.index - b.index);
			const first = bars[0];
			if (!first) return { code, message: g.message };
			return {
				code,
				message: `${g.message} in ${barsText(bars)}`,
				bar: first.index,
				written: first.written,
			};
		});
	}
}
