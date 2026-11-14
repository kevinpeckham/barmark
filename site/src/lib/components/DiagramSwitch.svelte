<script lang="ts">
let {
	on = $bindable(false),
	disabled = false,
}: {
	/** Whether the chart draws its guitar chord diagrams. */
	on?: boolean;
	/** The diagrams are the grid's: a score's Score view sets the switch aside. */
	disabled?: boolean;
} = $props();

const reason = $derived(
	disabled ? "Guitar diagrams are the grid's: switch to Grid to use them" : undefined,
);
</script>

<!-- The reason is on the button, for assistive technology, and on a wrapper too: a disabled button shows no tooltip in every browser. -->
<span class="inline-flex {disabled ? 'opacity-40' : ''}" title={reason}>
	<!-- The ring sits outside the button: inside, the accent ring would vanish on the accent fill when on. -->
	<button
		type="button"
		aria-pressed={on}
		{disabled}
		title={reason}
		onclick={() => (on = !on)}
		class="inline-flex items-center gap-1.5 rounded-md border border-white/45 px-2.5 py-1 text-xs opacity-80 hover-opacity-100 aria-[pressed=true]:(bg-accent text-on-accent opacity-100) disabled:cursor-not-allowed focus-visible-(outline-2 outline-accent outline-offset-2)"
	>
		<span class="i-ph-guitar" aria-hidden="true"></span>Guitar diagrams
	</button>
</span>
