<script lang="ts" generics="T extends string">
let {
	label,
	name,
	options,
	value = $bindable(),
	disabled = false,
	title,
	onreach,
}: {
	/** The group's accessible name. */
	label: string;
	/** The radios' shared name. */
	name: string;
	options: readonly { id: T; label: string; title?: string }[];
	value: T;
	/** Sets the whole group aside, dimmed. */
	disabled?: boolean;
	/** The group's tooltip: why it is set aside. */
	title?: string;
	/** The reader reached for an option (pointer, focus or touch), before choosing it. */
	onreach?: (id: T) => void;
} = $props();
</script>

<div
	role="radiogroup"
	aria-label={label}
	{title}
	class="inline-flex flex-wrap rounded-md border border-white/45 text-xs overflow-hidden{disabled ? ' opacity-40' : ''}"
>
	{#each options as o (o.id)}
		<!-- The group clips an outside ring, so the ring is inset: accent on the dark items, dark on the accent-filled one. -->
		<label
			title={o.title}
			class="relative px-2.5 py-1 cursor-pointer opacity-80 hover-opacity-100 has-[:checked]:(bg-accent text-on-accent opacity-100) has-[:focus-visible]:(outline-2 outline-accent -outline-offset-2) [&:has(:checked:focus-visible)]:outline-on-accent"
			onpointerenter={() => onreach?.(o.id)}
			ontouchstart={() => onreach?.(o.id)}
		>
			<input
				type="radio"
				{name}
				value={o.id}
				bind:group={value}
				{disabled}
				onfocus={() => onreach?.(o.id)}
				class="absolute inset-0 m-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
			/>{o.label}
		</label>
	{/each}
</div>
