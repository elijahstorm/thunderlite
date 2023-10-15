<script lang="ts">
	import Logo from '$lib/Components/Branding/Logo.svelte'

	const icons = {
		calendar: '/images/icon/colorful/calendar.svg',
		events: '/images/icon/colorful/events.svg',
		girlParty: '/images/icon/colorful/girl-party.svg',
		halloween: '/images/icon/colorful/halloween.svg',
		heart: '/images/icon/colorful/heart.svg',
		hospital: '/images/icon/colorful/hospital.svg',
		toronto: '/images/icon/colorful/toronto.svg',
		welcome: '/images/icon/colorful/welcome.svg',
	}

	export let icon: keyof typeof icons = 'events'
</script>

<div class="absolute inset-0 flex bg-white">
	<div
		class="flex-2 max-w-xl bg-brand-900 select-none overflow-hidden p-16 pb-0 flex-col hidden md:flex"
	>
		<div class="flex-1 w-full m-auto my-0 max-w-xs">
			<Logo height={200} />
		</div>
		<div class="flex-1 w-full m-auto max-w-xs relative mb-8 h-0">
			<img class="absolute" src="/images/icon/colorful/blob.svg" alt="white background" />
			<img class="absolute" src={icons[icon]} alt="haja-icon" />
		</div>
	</div>

	<div
		class="flex flex-col flex-3 max-w-2xl overflow-y-auto overflow-hidden py-16 px-4 md:p-16 md:pb-0"
	>
		<div class="my-0 mx-auto max-w-xs opacity-0 hidden sm:block sm:opacity-100">
			<Logo height={100} />
		</div>
		<slot />
		<img
			class="m-auto max-w-xs block opacity-100 md:hidden md:opacity-0"
			src={icons[icon]}
			alt="haja-icon"
		/>
	</div>
</div>
