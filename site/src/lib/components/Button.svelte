<script lang="ts">
import type { Snippet } from "svelte";

let {
	href,
	variant = "outline",
	external = false,
	children,
}: {
	href: string;
	variant?: "accent" | "outline";
	external?: boolean;
	children: Snippet;
} = $props();
</script>

<a
	{href}
	rel={external ? "noopener" : undefined}
	class={variant === "accent" ? "button-accent-solid" : "button-outline"}
>
	{@render children()}
</a>
