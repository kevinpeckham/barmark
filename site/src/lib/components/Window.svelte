<script lang="ts">
import type { Snippet } from "svelte";

let {
	title,
	children,
	controls,
}: {
	title: string;
	children: Snippet;
	/** Controls at the right of the title bar; they wrap under the title on a narrow screen. */
	controls?: Snippet;
} = $props();
</script>

<section class="device-window flex flex-col min-w-0">
	<header class="window-bar">
		<h2 class="window-label">{title}</h2>
		{@render controls?.()}
	</header>
	<!-- relative: absolutely placed text inside (the chart's screen-reader labels) scrolls with it rather than widening the page. -->
	<div class="relative flex-1 min-w-0 overflow-x-auto">
		{@render children()}
	</div>
</section>
