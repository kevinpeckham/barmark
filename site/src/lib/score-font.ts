/**
 * A workaround for @barmark/score 0.1.0: Verovio writes the Leipzig font
 * (the ♯, ♭ and ♩ in chord symbols and tempo marks) as an @font-face inside
 * the score's SVG, which lands in the element's shadow root, and Chromium
 * does not register a font face declared in a shadow root. Without it
 * "C♯m7" draws as "C m7". Once a score shows that face, a copy goes into
 * the document's head, once per page. Remove when the package does this.
 */
const MARK = "data-verovio-font";

function hoist(el: Element): boolean {
	const doc = el.ownerDocument;
	if (doc.querySelector(`style[${MARK}]`)) return true;
	const face = [...(el.shadowRoot?.querySelectorAll("style") ?? [])].find(
		(s) => s.textContent?.trimStart().startsWith("@font-face") && s.textContent.includes("Leipzig"),
	);
	if (!face) return false;
	const copy = doc.createElement("style");
	copy.setAttribute(MARK, "");
	copy.textContent = face.textContent;
	doc.head.append(copy);
	return true;
}

/** Watches `el`'s shadow root until a score brings the font, then copies it out; returns the stop. */
export function keepScoreFont(el: Element): () => void {
	if (hoist(el) || !el.shadowRoot) return () => {};
	const observer = new MutationObserver(() => {
		if (hoist(el)) observer.disconnect();
	});
	observer.observe(el.shadowRoot, { childList: true, subtree: true });
	return () => observer.disconnect();
}
