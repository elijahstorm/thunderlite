<script lang="ts">
	import LoginLogoutButton from '$lib/Components/Auth/LoginLogoutButton.svelte'
	import Logo from './Logo.svelte'

	export let logoLink: string = '/'
	export let toggleAside: VoidFunction | null = null
</script>

<div class="py-4 bg-stone-100 flex justify-center sticky top-0 z-20 md:relative">
	<div class="w-full flex container">
		{#if toggleAside}
			<button
				data-drawer-target="separator-sidebar"
				data-drawer-toggle="separator-sidebar"
				aria-controls="separator-sidebar"
				type="button"
				class="inline-flex items-center my-auto mr-4 text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
				on:click={toggleAside}
			>
				<span class="sr-only">Open sidebar</span>
				<svg
					class="w-6 h-6"
					aria-hidden="true"
					fill="currentColor"
					viewBox="0 0 20 20"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						clip-rule="evenodd"
						fill-rule="evenodd"
						d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z"
					></path>
				</svg>
			</button>
		{/if}

		<a href={logoLink}>
			<Logo width={156} height={40} />
		</a>
		<div class="flex-1" />
		<LoginLogoutButton />
	</div>
</div>
