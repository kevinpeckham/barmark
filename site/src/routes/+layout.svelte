<script lang="ts">
import "virtual:uno.css";
import SiteFooter from "#lib/components/SiteFooter.svelte";
import SiteNav from "#lib/components/SiteNav.svelte";

let { children } = $props();
</script>

<SiteNav />
{@render children()}
<SiteFooter />
