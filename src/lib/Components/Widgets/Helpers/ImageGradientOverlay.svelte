<script lang="ts">
	export let title: string
	export let info: string
	export let fileType: string
	export let fileName: string
	export let state: "ready" | "uploading" | "finished" | "failed" = "ready"
</script>

<div
	class="overlay w-full h-full overflow-hidden grid transition-all relative z-10"
	class:failed={state === "failed"}
>
	<p
		class="overflow-hidden z-20 p-4 text-white text-ellipsis text-sm col-start-1 col-end-2 row-start-2"
	>
		{title}
	</p>
	<p class="overflow-hidden z-20 text-xs p-4 text-white text-ellipsis col-start-1 row-start-3">
		{info}
	</p>
	<p class="overflow-hidden z-20 text-xs p-4 text-white text-ellipsis row-start-1 col-start-2">
		{fileType}
	</p>
	<p class="overflow-hidden z-20 text-xs p-4 text-white text-ellipsis col-start-1 row-start-1">
		{fileName}
	</p>
</div>

<style>
	.overlay {
		grid-template-columns: 3fr 1fr;
		grid-template-rows: 2rem 3.5rem repeat(2, 1fr);
		background-image: linear-gradient(
			#000f,
			#0009,
			#0007,
			#0003,
			transparent,
			transparent,
			transparent
		);
	}

	.overlay::before {
		position: absolute;
		content: "";
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: -1;
		transition: opacity 0.6s ease;
		opacity: 0;

		background-image: linear-gradient(
			#f00f,
			#f009,
			#f007,
			#f003,
			transparent,
			transparent,
			transparent
		);
	}

	.overlay.failed::before {
		opacity: 1;
	}
</style>
