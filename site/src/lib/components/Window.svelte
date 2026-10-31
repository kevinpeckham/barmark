<script lang="ts">
import type { Snippet } from "svelte";

let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="device-window flex flex-col min-w-0">
	<header class="window-label flex items-center justify-between gap-2">
		<h2>{title}</h2>
	</header>
	<div class="flex-1 min-w-0 overflow-x-auto">
		{@render children()}
	</div>
</section>
