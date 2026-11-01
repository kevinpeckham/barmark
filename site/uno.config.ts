import { fontFaceCss } from "@barmark/render";
import extractorSvelte from "@unocss/extractor-svelte";
import presetIcons from "@unocss/preset-icons";
import presetWebFonts, { type Provider } from "@unocss/preset-web-fonts";
import presetWind4 from "@unocss/preset-wind4";
import { defineConfig, transformerDirectives, transformerVariantGroup } from "unocss";

/**
 * Edwin ships inside @barmark/render, not on a font service, so it gets a
 * provider of its own: the package's @font-face rule, pointing at the copy
 * scripts/fonts.ts puts in static/fonts.
 */
const edwin = {
	name: "barmark-edwin" as Provider["name"],
	getPreflight: () => fontFaceCss("/fonts/Edwin-Roman.otf"),
	getFontName: (font) => `"${font.name}"`,
} satisfies Provider;

/**
 * Mirrors Stem Shovel's uno.config (~/projects/stem-shovel): wind4 with its
 * reset, Phosphor icons, Noto from bunny, the same palette, and the
 * shortcuts this site uses.
 */
export default defineConfig({
	extractors: [extractorSvelte()],
	presets: [
		presetWind4({ preflights: { reset: true } }),
		presetIcons({ warn: true }),
		presetWebFonts({
			provider: "bunny",
			fonts: {
				mono: "Noto Mono",
				serif: [
					{ name: "Noto Serif", weights: ["400"] },
					{ name: "Noto Serif", weights: ["400"], italic: true },
				],
				sans: "Noto Sans:400,600,700",
				chart: { name: "barmark Edwin", provider: edwin },
			},
		}),
	],
	transformers: [transformerDirectives(), transformerVariantGroup()],
	theme: {
		colors: {
			accent: "#ebf92f",
			"accent-1": "#ebf92f",
			"on-accent": "oklch(0.115 0.048 259.91)",
			light: "oklch(93.2% 0.032 255.585)",
			oxford: {
				50: "oklch(0.95 0.048 259.91)",
				100: "oklch(0.9 0.048 259.91)",
				200: "oklch(0.8 0.048 259.91)",
				300: "oklch(0.7 0.048 259.91)",
				400: "oklch(0.6 0.048 259.91)",
				500: "oklch(0.5 0.048 259.91)",
				600: "oklch(0.4 0.048 259.91)",
				700: "oklch(0.3 0.048 259.91)",
				800: "oklch(0.2 0.048 259.91)",
				900: "oklch(0.1 0.048 259.91)",
				950: "oklch(0.05 0.048 259.91)",
				DEFAULT: "oklch(0.252 0.048 259.91)",
			},
			dark: { DEFAULT: "oklch(0.115 0.048 259.91)" },
			offWhite: "oklch(0.9904 0.002 286.4)",
			row: "rgba(255, 255, 255, 0.05)",
			ink: "#f5f5f5",
			line: "rgba(255, 255, 255, 0.12)",
		},
	},
	// src/app.html is outside the Svelte pipeline, so its classes are listed here.
	safelist: [
		"font-sans",
		"bg-dark",
		"bg-gradient-to-br",
		"from-blue-950/20",
		"via-dark",
		"to-blue-950/40",
		"text-ink",
		"max-w-screen",
		"overflow-x-hidden",
		"grid",
		"grid-cols-1",
		"grid-rows-[auto_1fr_auto]",
		"min-h-screen",
		"max-w-full",
		"w-full",
	],
	shortcuts: [
		// The rendered chart, as chosen in the 2026-11-01 preview: @barmark/render's
		// --barmark-* settings, with lyrics in Noto Serif and labels in Noto Sans.
		[
			"barmark-look",
			[
				"[--barmark-size:15.5px] [--barmark-paper:oklch(96.89%_0.01_251.56/0.12)]",
				"[--barmark-ink:#fff] [--barmark-note:#ece8e0] [--barmark-accent:#e8a56a]",
				"[--barmark-muted:oklch(98.51%_0_0/0.8)] [--barmark-rule:oklch(98.51%_0_0/0.8)]",
				"[--barmark-directive:oklch(98.51%_0_0/0.8)]",
				'[--barmark-text-font:"Noto_Serif",Georgia,serif] [--barmark-label-font:"Noto_Sans",system-ui,sans-serif]',
			].join(" "),
		],
		["home-page-x-padding", "px-4 sm:px-6 md:px-7 lg:px-8 xl:px-24 2xl:px-48"],
		[
			"marketing-headline",
			"font-serif max-w-prose mb-4 text-balance text-19px lg-text-24px leading-snug",
		],
		[
			"button",
			"border border-current flex gap-2 items-center max-w-fit opacity-90 px-3 py-1.5 rounded text-[0.9em] disabled-opacity-40 disabled-pointer-events-none hover-text-oxford hover-bg-accent hover-opacity-100",
		],
		[
			"button-accent-solid",
			"button text-oxford bg-accent hover-outline outline-accent outline-offset-4 hover-text-oxford hover-shadow-lg",
		],
		[
			"button-outline",
			"inline-flex items-center gap-2 px-4 py-2 rounded-md border border-white/45 hover-(border-accent text-accent) focus-visible-(outline-2 outline-accent)",
		],
		["device-window", "bg-dark border-2 border-blue-200/10 rounded-lg overflow-hidden"],
		[
			"window-label",
			"text-xs uppercase tracking-wider opacity-60 px-3.5 py-2.5 border-b border-line",
		],
	],
});
