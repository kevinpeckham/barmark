/**
 * Copies Edwin and its licence from the installed @barmark/render into
 * static/fonts, so the site serves the font of the renderer it runs, and
 * gathers the Noto licences beside them. The Noto files themselves come
 * from @fontsource (imported in +layout.svelte), so Vite gives them hashed
 * names under /_app/immutable. UnoCSS registers Edwin (uno.config.ts);
 * static/fonts is not committed.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const site = join(import.meta.dir, "..");
const packageDir = (name: string) => dirname(Bun.resolveSync(`${name}/package.json`, site));
const to = join(site, "static/fonts");
mkdirSync(to, { recursive: true });

const render = join(packageDir("@barmark/render"), "fonts");
for (const file of ["Edwin-Roman.otf", "OFL.txt"]) copyFileSync(join(render, file), join(to, file));

const noto = ["noto-sans", "noto-serif", "noto-mono"].map(
	(name) =>
		`== ${name} (@fontsource/${name}) ==\n\n${readFileSync(join(packageDir(`@fontsource/${name}`), "LICENSE"), "utf8")}`,
);
writeFileSync(join(to, "Noto-OFL.txt"), `${noto.join("\n\n")}\n`);
