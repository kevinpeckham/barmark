<script lang="ts">
let { value = $bindable(), label }: { value: string; label: string } = $props();
</script>

<label class="sr-only" for="barmark-source">{label}</label>
<textarea
	id="barmark-source"
	bind:value
	spellcheck="false"
	autocapitalize="off"
	autocomplete="off"
	wrap="off"
	class="block w-full h-full min-h-80 resize-y bg-transparent p-4 font-mono text-sm leading-relaxed text-ink outline-none focus-visible-(outline-solid outline-2 outline-accent -outline-offset-2)"
></textarea>
