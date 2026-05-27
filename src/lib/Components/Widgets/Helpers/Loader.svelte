<script lang="ts">
	export let label: string = ''
	export let size: number = 32
</script>

<div class="flex flex-col items-center justify-center gap-3 py-6">
	<div
		class="loader rounded-full border-2 border-border border-t-primary"
		style="width: {size}px; height: {size}px;"
		role="status"
		aria-live="polite"
	></div>
	{#if label}
		<p class="text-xs text-muted-foreground">{label}</p>
	{/if}
</div>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.loader {
		animation: spin 0.7s linear infinite;
	}
</style>
