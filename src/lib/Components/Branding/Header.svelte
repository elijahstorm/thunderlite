<script lang="ts">
	import LoginLogoutButton from '$lib/Components/Auth/LoginLogoutButton.svelte'
	import Logo from './Logo.svelte'

	export let logoLink: string = '/'
</script>

<div class="py-4 bg-stone-100 flex justify-center">
	<div class="w-full flex container">
		<a href={logoLink}>
			<Logo width={156} height={40} />
		</a>
		<div class="flex-1" />
		<LoginLogoutButton />
	</div>
</div>
