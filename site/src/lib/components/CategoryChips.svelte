<script lang="ts">
import { CATEGORIES, type Category } from "#lib/guide/rows.js";

let { value = $bindable() }: { value: Category | null } = $props();

const chip =
	"px-3 py-1 rounded-full border text-sm border-white/45 hover-border-accent aria-pressed-(bg-accent text-on-accent border-accent) focus-visible-(outline-2 outline-accent outline-offset-2)";
</script>

<div role="group" aria-label="Category" class="flex flex-wrap gap-2">
	<button type="button" data-chip="all" class={chip} aria-pressed={value === null} onclick={() => (value = null)}
		>All</button
	>
	{#each CATEGORIES as category (category)}
		<button
			type="button"
			data-chip={category}
			class="{chip} capitalize"
			aria-pressed={value === category}
			onclick={() => (value = value === category ? null : category)}>{category}</button
		>
	{/each}
</div>
