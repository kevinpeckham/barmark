<script lang="ts">
import { LINKS } from "#lib/site.js";

const link = "underline decoration-white/30 underline-offset-3 hover-text-accent";
</script>

<footer class="home-page-x-padding py-6 border-t border-line text-xs opacity-70">
	Code <a href={LINKS.license} class={link}>MIT</a> · grammar
	<a href={LINKS.specLicense} class={link}>CC BY 4.0</a> · scores engraved by
	<a href={LINKS.verovio} class={link}>Verovio</a>
	(<a href={LINKS.verovioLicense} class={link}>LGPL-3.0</a>) · by
	<a href={LINKS.lightningJar} class={link}>Lightning Jar</a> · part of
	<a href={LINKS.stemShovel} class={link}>Stem Shovel</a>
</footer>
