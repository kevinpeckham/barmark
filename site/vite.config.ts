import adapter from "@sveltejs/adapter-vercel";
import { sveltekit } from "@sveltejs/kit/vite";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	// An ES worker keeps stock Verovio in a chunk of its own, loaded only if the lighter build
	// (@barmark/engraver, its .wasm beside the worker) fails; as iife (the default) Vite inlines
	// stock into the worker, about 3.5 MB gzipped in all against about 1.1 MB.
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
