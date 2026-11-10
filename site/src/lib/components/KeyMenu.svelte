<script lang="ts">
import { tick } from "svelte";
import { type ChartKey, keyChoices, keyLabel } from "#lib/key.js";

let {
	key,
	semitones = $bindable(0),
}: {
	/** The chart's own key; null when it names none. */
	key: ChartKey | null;
	/** How far the chart is drawn from its own key, −5..+6. */
	semitones?: number;
} = $props();

const label = $derived(keyLabel(key, semitones));
const choices = $derived(keyChoices(key, semitones));

let open = $state(false);
let root: HTMLDivElement;
let button: HTMLButtonElement;
let items: HTMLButtonElement[] = $state([]);
const id = $props.id();

/** Opens the menu with the focus on the key checked, or on the first or last. */
async function show(at: "checked" | "first" | "last" = "checked") {
	open = true;
	await tick();
	const index =
		at === "first" ? 0 : at === "last" ? items.length - 1 : choices.findIndex((c) => c.checked);
	items[Math.max(0, index)]?.focus();
}

function hide(refocus = true) {
	open = false;
	if (refocus) button.focus();
}

function pick(n: number) {
	semitones = n;
	hide();
}

function onButtonKey(e: KeyboardEvent) {
	if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
		e.preventDefault();
		void show();
	} else if (e.key === "ArrowUp") {
		e.preventDefault();
		void show("last");
	}
}

function onMenuKey(e: KeyboardEvent) {
	const at = items.indexOf(document.activeElement as HTMLButtonElement);
	const move = (to: number) => {
		e.preventDefault();
		items[(to + items.length) % items.length]?.focus();
	};
	if (e.key === "ArrowDown") move(at + 1);
	else if (e.key === "ArrowUp") move(at - 1);
	else if (e.key === "Home") move(0);
	else if (e.key === "End") move(items.length - 1);
	else if (e.key === "Escape") {
		e.preventDefault();
		hide();
	} else if (e.key === "Tab") hide(false);
}

/** Focus or a click leaving the menu closes it. */
function onFocusOut(e: FocusEvent) {
	if (open && !root.contains(e.relatedTarget as Node | null)) hide(false);
}

function onWindowPointer(e: PointerEvent) {
	if (open && !root.contains(e.target as Node)) hide(false);
}
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div bind:this={root} class="relative" onfocusout={onFocusOut}>
	<button
		bind:this={button}
		type="button"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-controls={open ? `${id}-menu` : undefined}
		aria-label="Key: {label}"
		title="Key: the chart drawn in another key (the source doesn't change)"
		class="inline-flex items-center gap-1.5 rounded-md border border-white/45 px-2.5 py-1 text-xs opacity-80 hover-opacity-100 aria-[expanded=true]:(bg-accent text-on-accent opacity-100) focus-visible-(outline-2 outline-accent -outline-offset-2)"
		onclick={() => (open ? hide() : void show())}
		onkeydown={onButtonKey}
	>
		<span class="i-ph-music-note" aria-hidden="true"></span>{label}<span
			class="i-ph-caret-down"
			aria-hidden="true"
		></span>
	</button>
	{#if open}
		<div
			id="{id}-menu"
			role="menu"
			aria-label="Key"
			tabindex="-1"
			class="absolute right-0 lt-sm:(left-0 right-auto) top-full z-10 mt-1 flex flex-col min-w-36 max-h-72 overflow-y-auto rounded-md border border-white/45 bg-dark py-1 text-sm shadow-lg shadow-black/40"
			onkeydown={onMenuKey}
		>
			{#each choices as choice, i (choice.semitones)}
				<button
					bind:this={items[i]}
					type="button"
					role="menuitemradio"
					aria-checked={choice.checked}
					tabindex="-1"
					class="flex items-center gap-2 px-3 py-1 text-left whitespace-nowrap hover-(bg-accent text-on-accent) focus-visible-(bg-accent text-on-accent outline-none)"
					onclick={() => pick(choice.semitones)}
				>
					<span class="i-ph-check {choice.checked ? '' : 'invisible'}" aria-hidden="true"></span>{choice.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
