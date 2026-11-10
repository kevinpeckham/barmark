import adapter from "@sveltejs/adapter-vercel";
import { sveltekit } from "@sveltejs/kit/vite";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	// An ES worker keeps Verovio in a chunk of its own, loaded only if jsDelivr's copy fails;
	// as iife (the default) Vite 8 bundles all 8 MB into the worker, downloaded besides the CDN's.
	worker: { format: "es" },
	plugins: [
		UnoCSS(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
			},
			adapter: adapter(),
		}),
	],
});
