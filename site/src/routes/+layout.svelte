<script lang="ts">
import "virtual:uno.css";
import { fontFaceCss } from "@barmark/render";
import SiteFooter from "#lib/components/SiteFooter.svelte";
import SiteNav from "#lib/components/SiteNav.svelte";

let { children } = $props();

// Edwin, from the copy scripts/fonts.ts puts in static/fonts. The element
// finds this marked style and registers no second copy of its own.
const edwin = `<style data-barmark-font>${fontFaceCss("/fonts/Edwin-Roman.otf")}</style>`;
</script>

<svelte:head>{@html edwin}</svelte:head>

<SiteNav />
{@render children()}
<SiteFooter />
