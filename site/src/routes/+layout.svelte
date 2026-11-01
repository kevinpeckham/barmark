<script lang="ts">
import "virtual:uno.css";
import { fontFaceCss } from "@barmark/render";
import SiteFooter from "#lib/components/SiteFooter.svelte";
import SiteNav from "#lib/components/SiteNav.svelte";
import { LINKS } from "#lib/site.js";

let { children } = $props();

// Edwin, from the copy scripts/fonts.ts puts in static/fonts. The element
// finds this marked style and registers no second copy of its own.
const edwin = `<style data-barmark-font>${fontFaceCss("/fonts/Edwin-Roman.otf")}</style>`;
</script>

<svelte:head>
	{@html edwin}
	<!-- Every page shares one card; scripts/og.ts draws it. -->
	<meta property="og:image" content="{LINKS.origin}/og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="barmark: a chord chart's plain-text source beside the chart @barmark/render draws from it."
	/>
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<SiteNav />
{@render children()}
<SiteFooter />
