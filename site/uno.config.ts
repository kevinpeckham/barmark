import extractorSvelte from "@unocss/extractor-svelte";
import presetIcons from "@unocss/preset-icons";
import presetWind4 from "@unocss/preset-wind4";
import { defineConfig, transformerDirectives, transformerVariantGroup } from "unocss";

/**
 * Mirrors Stem Shovel's uno.config (~/projects/stem-shovel): wind4 with its
 * reset, Phosphor icons, the Noto families, the same palette, and the
 * shortcuts this site uses. The Noto files are served from the site
 * (@fontsource, imported in +layout.svelte), not fetched at build.
 */
export default defineConfig({
	extractors: [extractorSvelte()],
	presets: [presetWind4({ preflights: { reset: true } }), presetIcons({ warn: true })],
	transformers: [transformerDirectives(), transformerVariantGroup()],
	theme: {
		// The stacks presetWebFonts built for these families, now that the files ship with the site.
		font: {
			sans: '"Noto Sans",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"',
			serif: '"Noto Serif",ui-serif,Georgia,Cambria,"Times New Roman",Times,serif',
			mono: '"Noto Mono",ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
		},
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
		// clip, not hidden, on the page's wrapper: hidden makes it a scroll box, and the FAQ's sticky column would scroll away.
		"overflow-x-clip",
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
				"[--barmark-size:15.5px]",
				"[--barmark-paper:transparent]",
				"[--barmark-ink:oklch(13.96%_0.05_262.12)]",
				"[--barmark-note:oklch(13.96%_0.05_262.12_/_1)]",
				"[--barmark-accent:oklch(13.96%_0.05_262.12_/_0.9)]",
				"[--barmark-muted:oklch(13.96%_0.05_262.12_/_0.75)]",
				"[--barmark-rule:oklch(13.96%_0.05_262.12_/_1)]",
				"[--barmark-directive:oklch(13.96%_0.05_262.12_/_0.75)]",
				'[--barmark-text-font:"Noto_Serif",Georgia,serif]',
				'[--barmark-label-font:"Noto_Sans",system-ui,sans-serif]',
			].join(" "),
		],
		[
			"marketing-headline",
			"font-serif max-w-prose mb-4 text-balance text-19px lg-text-24px leading-snug",
		],
		[
			"button",
			"border border-current flex gap-2 items-center max-w-fit opacity-90 px-3 py-1.5 rounded text-[0.9em] disabled-opacity-40 disabled-pointer-events-none hover-text-oxford hover-bg-accent hover-opacity-100",
		],
		// The two link buttons share one box and one type size, so a row of them lines up.
		[
			"button-link",
			"inline-flex items-center gap-2 px-4 py-2 rounded-md border font-sans text-sm leading-normal focus-visible-(outline-2 outline-accent outline-offset-2)",
		],
		[
			"button-accent-solid",
			"button-link border-accent text-oxford bg-accent hover-(outline outline-accent outline-offset-4 shadow-lg)",
		],
		["button-outline", "button-link border-white/45 hover-(border-accent text-accent)"],
		["device-window", "bg-dark border-2 border-blue-200/10 rounded-lg overflow-hidden"],
		[
			"window-bar",
			"flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5 border-b border-line",
		],
		["window-label", "text-xs uppercase tracking-wider opacity-60"],
		["main-y-padding", "pt-10 pb-14 lg:(pt-12 pb-16) xl:(pt-14 pb-20) 2xl:(pt-16 pb-22)"],
		["marketing-section-heading", "font-mono uppercase text-accent text-0.85em leading-tight mb-5"],
		["page-x-padding", "px-4 sm:px-6 md:px-7 lg:px-8 xl:px-16 2xl:px-24"],
	],
});
