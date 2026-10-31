const ENTITIES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/** Text from the chart, safe in element content and in quoted attributes. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
