<script lang="ts">
import { LINKS } from "#lib/site.js";

const link = "opacity-80 hover-(opacity-100 text-accent) focus-visible-(outline-2 outline-accent)";
</script>

<nav class="home-page-x-padding flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 border-b border-line">
	<a href="/" class="font-mono font-700 text-lg tracking-tight text-accent">barmark</a>
	<ul class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
		<li><a href="/syntax" class={link}>Syntax</a></li>
		<li>
			<a href={LINKS.github} class="{link} inline-flex items-center gap-1.5">
				<span class="i-ph-github-logo" aria-hidden="true"></span>GitHub
			</a>
		</li>
		<li><a href={LINKS.npm} class={link}>npm</a></li>
	</ul>
</nav>
