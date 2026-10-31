/**
 * Copies Edwin and its licence from the installed @barmark/render into
 * static/fonts, so the site serves the font of the renderer it runs.
 * UnoCSS registers it (uno.config.ts); static/fonts is not committed.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const site = join(import.meta.dir, "..");
const from = join(dirname(Bun.resolveSync("@barmark/render/package.json", site)), "fonts");
const to = join(site, "static/fonts");
mkdirSync(to, { recursive: true });
for (const file of ["Edwin-Roman.otf", "OFL.txt"]) copyFileSync(join(from, file), join(to, file));
