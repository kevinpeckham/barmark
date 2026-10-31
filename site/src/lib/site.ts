/** Where barmark.dev points, and the copy the home page leads with. */
export const LINKS = {
	github: "https://github.com/kevinpeckham/barmark",
	npm: "https://www.npmjs.com/package/barmark",
	article: "https://www.lightningjar.com/blog/introducing-barmark",
	stemShovel: "https://www.stemshovel.com",
	grammar: "https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md",
	origin: "https://barmark.dev",
} as const;

export const HEADLINE =
	"A markdown-inspired plain-text notation for chord charts that bands and machines can both read.";

// The second sentence, split around its link.
export const TAGLINE_BEFORE = "barmark was developed as part of ";
export const TAGLINE_LINK = "Stem Shovel";
export const TAGLINE_AFTER = ", an open-source platform for musician collaboration.";
