/** Where barmark.dev points, and the copy the home page leads with. */
export const LINKS = {
	github: "https://github.com/kevinpeckham/barmark",
	npm: "https://www.npmjs.com/package/barmark",
	article: "https://www.lightningjar.com/blog/introducing-barmark",
	stemShovel: "https://www.stemshovel.com",
	grammar: "https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md",
	license: "https://github.com/kevinpeckham/barmark/blob/main/LICENSE",
	specLicense: "https://github.com/kevinpeckham/barmark/blob/main/docs/LICENSE",
	issues: "https://github.com/kevinpeckham/barmark/issues",
	renderReadme: "https://github.com/kevinpeckham/barmark/tree/main/packages/render#readme",
	cliReadme: "https://github.com/kevinpeckham/barmark/tree/main/packages/cli#readme",
	cliReleases: "https://github.com/kevinpeckham/barmark/releases?q=cli-v",
	songs: "https://github.com/kevinpeckham/songs",
	parserReadme: "https://github.com/kevinpeckham/barmark/tree/main/packages/barmark#readme",
	lightningJar: "https://www.lightningjar.com",
	origin: "https://www.barmark.dev",
} as const;

export const HEADLINE =
	"A markdown-inspired plain-text notation for chord charts that bands and machines can both read.";

// The second sentence, split around its link.
export const TAGLINE_BEFORE = "Barmark was developed as part of ";
export const TAGLINE_LINK = "Stem Shovel";
export const TAGLINE_AFTER = ", an open-source platform for musician collaboration.";

// What it offers, after the Stem Shovel sentence.
export const VALUE =
	"It gives musicians a way to write charts that is predictable, precise, and easy to read and write, so a band can agree on one style. And it gives modern music applications charts they can read, transpose and display exactly as the band means them.";
