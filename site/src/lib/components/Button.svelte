<script lang="ts">
import type { Snippet } from "svelte";

let {
	href,
	variant = "outline",
	children,
}: {
	href: string;
	variant?: "accent" | "outline";
	children: Snippet;
} = $props();
</script>

<a
	{href}
	class={variant === "accent" ? "button-accent-solid" : "button-outline"}
>
	{@render children()}
</a>
