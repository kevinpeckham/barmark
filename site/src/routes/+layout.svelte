<script lang="ts">
// The Noto families, served from the site: Vite hashes the files into /_app/immutable.
import "@fontsource/noto-mono/400.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-serif/400.css";
import "@fontsource/noto-serif/400-italic.css";
import "virtual:uno.css";
import { fontFaceCss } from "@barmark/render";
import { trackRoute } from "#lib/analytics.js";
import SiteFooter from "#lib/components/SiteFooter.svelte";
import SiteNav from "#lib/components/SiteNav.svelte";
import { LINKS } from "#lib/site.js";
import { afterNavigate } from "$app/navigation";
import { page } from "$app/state";

let { children } = $props();

afterNavigate(() => trackRoute(page.route.id, page.url.pathname));

// Edwin, from the copy scripts/fonts.ts puts in static/fonts. The element
// finds this marked style and registers no second copy of its own.
const edwin = `<style data-barmark-font>${fontFaceCss("/fonts/Edwin-Roman.otf")}</style>`;
</script>

<svelte:head>
	{@html edwin}
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<!-- Every page shares one card; scripts/og.ts draws it. -->
	<meta property="og:image" content="{LINKS.origin}/og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="Barmark: a chord chart's plain-text source beside the chart @barmark/render draws from it."
	/>
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<SiteNav />
{@render children()}
<SiteFooter />
