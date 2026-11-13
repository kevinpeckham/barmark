/**
 * One guitar chord diagram as inline SVG (design 5.3, 5.5): six strings,
 * five fret spaces, a dot for each fretted string, a bar for a barre, `×`
 * and `○` above the nut. Colours and strokes come from the stylesheet's
 * classes, so themes, forced colours and print apply.
 */
import type { Shape } from "@barmark/fretboard";
import { escapeHtml } from "./escape.js";

/**
 * The drawing, in the viewBox's units: strings 10 apart from x 23 (room at
 * the left for the fret number), fret lines 12 apart from y 13 (room above
 * for the open and muted marks), dots 76% of a string's spacing across.
 */
const STRING = { first: 23, gap: 10 };
const FRET = { top: 13, gap: 12 };
const DOT = 3.8;
const MARK = { y: 5, size: 2.8 };
const LAST = STRING.first + 5 * STRING.gap;
/** The viewBox's size, and the x of the strings' middle, which the name under it centres on. */
export const DIAGRAM_VIEW = { width: 78, height: 75, centre: (STRING.first + LAST) / 2 };

const n = (v: number) => String(Math.round(v * 10) / 10);
const range = (count: number) => Array.from({ length: count }, (_, i) => i);

/** The strings and fret lines: the same for either hand. */
const GRID = `<path class="bm-dg-grid" d="${[
	...range(6).map((i) => `M${STRING.first + i * STRING.gap} ${FRET.top}v${5 * FRET.gap}`),
	...range(6).map((k) => `M${STRING.first} ${FRET.top + k * FRET.gap}h${5 * STRING.gap}`),
].join("")}"/>`;
/** First position: a thick nut over the top fret line. */
const NUT = `<rect class="bm-dg-nut" x="${STRING.first - 0.5}" y="${FRET.top - 3.5}" width="${5 * STRING.gap + 1}" height="4"/>`;

/** A string's x: low string at the left right-handed, at the right left-handed. */
const stringX = (i: number, hand: "right" | "left") =>
	hand === "left" ? LAST - i * STRING.gap : STRING.first + i * STRING.gap;
/** The middle of fret space `space` (1 to 5), counted from the shape's base. */
const spaceY = (space: number) => FRET.top + space * FRET.gap - FRET.gap / 2;

/** `×` over a muted string, `○` over an open one. */
function markSvg(fret: number, x: number): string {
	if (fret < 0) {
		const s = MARK.size;
		return `<path class="bm-dg-mark" d="M${n(x - s)} ${n(MARK.y - s)}l${2 * s} ${2 * s}m0-${2 * s}l-${2 * s} ${2 * s}"/>`;
	}
	return fret === 0
		? `<circle class="bm-dg-mark" cx="${n(x)}" cy="${MARK.y}" r="${MARK.size}"/>`
		: "";
}

/** The barre: one rounded bar across its strings, at its fret. */
function barreSvg(shape: Shape, hand: "right" | "left"): string {
	const { barre } = shape;
	if (!barre) return "";
	const ends = [stringX(barre.from, hand), stringX(barre.to, hand)];
	const [lo, hi] = [Math.min(...ends), Math.max(...ends)];
	const y = spaceY(barre.fret - shape.base + 1);
	return `<rect class="bm-dg-barre" x="${n(lo - DOT)}" y="${n(y - DOT)}" width="${n(hi - lo + 2 * DOT)}" height="${n(2 * DOT)}" rx="${DOT}"/>`;
}

/** Whether string `i`'s note is held by the barre, so it gets no dot of its own. */
const underBarre = (shape: Shape, i: number) => {
	const b = shape.barre;
	return b !== undefined && shape.frets[i] === b.fret && i >= b.from && i <= b.to;
};

/** A dot on each fretted string the barre does not hold. */
const dotsSvg = (shape: Shape, hand: "right" | "left") =>
	shape.frets
		.map((fret, i) =>
			fret > 0 && !underBarre(shape, i)
				? `<circle class="bm-dg-dot" cx="${n(stringX(i, hand))}" cy="${n(spaceY(fret - shape.base + 1))}" r="${DOT}"/>`
				: "",
		)
		.join("");

/** The nut in first position, else the first fret drawn, at the left beside the first space. */
const topSvg = (base: number) =>
	base === 1
		? NUT
		: `<text class="bm-dg-fret" x="${STRING.first - 5}" y="${n(spaceY(1) + 3.5)}" font-size="10">${escapeHtml(`${base}fr`)}</text>`;

/**
 * A shape as one `<svg role="img">` named by `label`. Left-handed mirrors
 * the strings only: the low string is drawn on the right, and the fret
 * number stays at the left.
 */
export function diagramSvg(shape: Shape, hand: "right" | "left", label: string): string {
	const marks = shape.frets.map((fret, i) => markSvg(fret, stringX(i, hand))).join("");
	return `<svg class="bm-diagram-svg" role="img" aria-label="${escapeHtml(label)}" viewBox="0 0 ${DIAGRAM_VIEW.width} ${DIAGRAM_VIEW.height}">${GRID}${topSvg(shape.base)}${marks}${barreSvg(shape, hand)}${dotsSvg(shape, hand)}</svg>`;
}
