<script lang="ts">
let { value = $bindable() }: { value: string } = $props();
</script>

<div class="flex flex-col gap-1.5 min-w-0 flex-1">
	<label for="guide-search" class="text-xs uppercase tracking-wider opacity-60">Search</label>
	<div class="flex items-center gap-2 rounded-md border border-white/45 px-3 py-2 focus-within-(border-accent outline-2 outline-accent/40)">
		<span class="i-ph-magnifying-glass opacity-60" aria-hidden="true"></span>
		<input
			id="guide-search"
			type="search"
			bind:value
			placeholder="repeat, %, sus4, key:"
			autocomplete="off"
			spellcheck="false"
			class="w-full bg-transparent outline-none placeholder:text-white/60"
		/>
	</div>
</div>
