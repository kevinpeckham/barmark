<script lang="ts">
import Window from "#lib/components/Window.svelte";

let { title, code }: { title: string; code: string } = $props();
</script>

<Window {title}>
	<pre class="p-4 font-mono text-sm leading-relaxed whitespace-pre [tab-size:2]"><code>{code}</code></pre>
</Window>
