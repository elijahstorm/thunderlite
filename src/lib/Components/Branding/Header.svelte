<script lang="ts">
	import LoginHeader from '$lib/Components/Auth/LoginHeader.svelte'

	export let logoLink: string = '/'
</script>

<div class="px-8 py-4 bg-stone-100 flex justify-center">
	<div class="max-w-4xl w-full flex">
		<a href={logoLink}>
			<img class="cursor-pointer w-24" src="/images/logo-full.png" alt="HAJA" />
		</a>
		<div class="flex-1" />
		<LoginHeader />
	</div>
</div>
