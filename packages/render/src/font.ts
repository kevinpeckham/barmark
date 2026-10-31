/**
 * Edwin is registered on the host page, not in the shadow root (some
 * browsers ignore @font-face there), under its own family name so it can
 * never collide with a page's fonts. The file ships unmodified (OFL).
 */
export const FONT_FAMILY = "barmark Edwin";

/** One @font-face rule for the font at `url`; the URL cannot close the string or the <style>. */
export function fontFaceCss(url: string): string {
	const safe = url.replace(
		/["\\<>\n\r]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
	);
	return `@font-face{font-family:"${FONT_FAMILY}";src:url("${safe}") format("opentype");font-display:swap}`;
}
