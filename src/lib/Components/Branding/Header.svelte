<script lang="ts">
	import LoginHeader from '$lib/Components/Auth/LoginHeader.svelte'
	import Logo from './Logo.svelte'

	export let logoLink: string = '/'
</script>

<div class="py-4 bg-stone-100 flex justify-center">
	<div class="w-full flex container">
		<a href={logoLink}>
			<Logo width={96} height={50} />
		</a>
		<div class="flex-1" />
		<LoginHeader />
	</div>
</div>
