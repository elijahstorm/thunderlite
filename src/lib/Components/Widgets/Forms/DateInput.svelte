<script lang="ts">
	// import { Datepicker } from "svelte-calendar"

	const format = 'ddd, MMM D, YYYY'
	const theme = {
		calendar: {
			shadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.1)',
			colors: {
				background: {
					highlight: 'var(--primary)',
				},
			},
		},
	}

	export let date

	const add = (amt) => date.add(1, amt)

	const sub = (amt) => date.add(-1, amt)
</script>

<section
	class="flex flex-col self-center py-0 px-4 mb-8 col-start-1 col-end-3 gap-4 justify-center items-center"
>
	<div class="flex gap-4 justify-center items-center remove-defaults">
		Not implemented
		<!-- <Datepicker bind:store={date} {theme} {format} let:key let:send let:receive>
			<div class="m-atuo cursor-pointer" in:receive|local={{ key }} out:send|local={{ key }}>
				{($date?.selected ?? new Date()).toLocaleDateString("en-us", {
					weekday: "short",
					year: "numeric",
					month: "short",
					day: "numeric"
				})}
			</div>
		</Datepicker> -->
	</div>

	<div class="flex gap-4 justify-center items-center">
		<button
			class="btn btn-secondary text-xs px-3 py-2 flex content-center h-max"
			on:click={() => sub('week')}>-&nbsp;week</button
		>
		<button
			class="btn btn-secondary text-xs px-3 py-2 flex content-center h-max"
			on:click={() => add('week')}>+&nbsp;week</button
		>
	</div>
</section>

<style>
	:global(.remove-defaults .button) {
		color: unset;
		border-radius: unset;
		border: unset;
		box-shadow: unset;
	}
</style>
