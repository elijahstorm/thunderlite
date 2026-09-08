<script lang="ts">
	import FieldGround from '$lib/Components/Branding/FieldGround.svelte'
	import Header from '$lib/Components/Branding/Header.svelte'

	interface Props {
		logoLink?: string
		toggleAside?: VoidFunction | null
		children?: import('svelte').Snippet
	}

	let { logoLink = '/', toggleAside = null, children }: Props = $props()
</script>

<!-- In-app pages stand on the same printed ground as the marketing shell, so
	 crossing from the landing page into a roster or a lobby never changes
	 documents. -->
<div class="relative min-h-screen field-backdrop">
	<div class="pointer-events-none fixed inset-0 z-0"><FieldGround /></div>

	<div class="relative z-10">
		<Header {logoLink} {toggleAside} />

		<div class="container w-full break break-word pt-8 pb-16">
			{@render children?.()}
		</div>
	</div>
</div>
