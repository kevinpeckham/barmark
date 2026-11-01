/**
 * Draws barmark.dev's Open Graph card (static/og.png, 1200×630): the
 * wordmark, the headline, and a chart's source beside the chart as the
 * installed @barmark/render draws it, in the site's look. The PNG is
 * committed; run `bun run og` after changing the headline, the look or the
 * renderer.
 */
import { join } from "node:path";
import { fontFaceCss, renderChart } from "@barmark/render";
import { chromium } from "@playwright/test";
import { HEADLINE } from "../src/lib/site.ts";

const site = join(import.meta.dir, "..");
const SOURCE = `# Peaceful Dreams
key: D, time: 4/4, tempo: 145

## Verse
| D5 | % | A5 | % |
| G5(7) | % | D5 | % |
Morning comes in slow
| A5 | B5(7) | G5(7) | % |`;

const edwin = Buffer.from(
	await Bun.file(join(site, "node_modules/@barmark/render/fonts/Edwin-Roman.otf")).arrayBuffer(),
).toString("base64");
const escapeHtml = (text: string) =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// The colours and fonts are barmark.dev's: the barmark-look shortcut and the theme in uno.config.ts.
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.bunny.net/css?family=noto-sans:400,600,700|noto-serif:400,400i|noto-sans-mono:400,700">
<style>${fontFaceCss(`data:font/otf;base64,${edwin}`)}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;padding:56px 64px;display:flex;flex-direction:column;gap:28px;color:#f5f5f5;font-family:"Noto Sans",sans-serif;
	background:linear-gradient(to bottom right,oklch(0.25 0.09 265/0.2),oklch(0.115 0.048 259.91) 45%,oklch(0.25 0.09 265/0.4)),oklch(0.115 0.048 259.91)}
.mark{font:700 34px/1 "Noto Sans Mono",monospace;letter-spacing:-.02em;color:#ebf92f}
h1{font:400 36px/1.3 "Noto Serif",serif;text-wrap:balance}
.panes{flex:1;display:grid;grid-template-columns:380px 1fr;gap:20px;min-height:0}
.pane{border:2px solid rgb(191 219 254/0.1);border-radius:10px;background:oklch(0.115 0.048 259.91);overflow:hidden}
.label{font-size:13px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.12)}
pre{font:15px/1.6 "Noto Sans Mono",monospace;padding:12px 14px;color:#f5f5f5}
.chart{padding:12px 16px}
barmark-chart{--barmark-size:15.5px;--barmark-paper:oklch(96.89% 0.01 251.56/0.12);--barmark-ink:#fff;--barmark-note:#ece8e0;--barmark-accent:#e8a56a;
	--barmark-muted:oklch(98.51% 0 0/0.8);--barmark-rule:oklch(98.51% 0 0/0.8);--barmark-directive:oklch(98.51% 0 0/0.8);
	--barmark-text-font:"Noto Serif",Georgia,serif;--barmark-label-font:"Noto Sans",system-ui,sans-serif}
</style></head><body>
<div class="mark">barmark</div>
<h1>${escapeHtml(HEADLINE).replace("plain-text", "plain\u2011text")}</h1>
<div class="panes">
	<section class="pane"><div class="label">Source</div><pre>${escapeHtml(SOURCE)}</pre></section>
	<section class="pane"><div class="label">Rendered · @barmark/render</div><div class="chart">${renderChart(SOURCE, { theme: "dark", rehearsalLetters: true })}</div></section>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(site, "static/og.png") });
await browser.close();
console.log("static/og.png");
