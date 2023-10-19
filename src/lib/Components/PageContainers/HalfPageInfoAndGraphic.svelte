<script lang="ts">
	import Logo from '$lib/Components/Branding/Logo.svelte'

	const icons = {
		calendar: '/images/icons/colorful/calendar.svg',
		events: '/images/icons/colorful/events.svg',
		girlParty: '/images/icons/colorful/girl-party.svg',
		halloween: '/images/icons/colorful/halloween.svg',
		heart: '/images/icons/colorful/heart.svg',
		hospital: '/images/icons/colorful/hospital.svg',
		toronto: '/images/icons/colorful/toronto.svg',
		welcome: '/images/icons/colorful/welcome.svg',
	}

	export let icon: keyof typeof icons = 'welcome'
</script>

<div class="absolute inset-0 bg-brand-400 flex">
	<div
		class="flex-[2] max-w-md bg-brand-600 select-none overflow-hidden p-16 pb-0 flex-col hidden md:flex"
	>
		<div class="flex-1 w-full m-auto my-0">
			<Logo height={200} />
		</div>
		<div class="flex-1 w-full m-auto relative mb-8 h-0">
			<img
				class="absolute opacity-50"
				src="/images/icons/colorful/blob.svg"
				alt="white background"
			/>
			<img class="absolute" src={icons[icon]} alt="bg-icon" />
		</div>
	</div>

	<div
		class="flex-[3] max-w-4xl flex flex-col items-center gap-10 overflow-y-auto overflow-hidden px-4 pb-16 pt-12 md:px-16 md:pt-40 md:pb-0"
	>
		<div class="my-0 mx-auto block opacity-100 md:opacity-0 md:hidden">
			<Logo height={100} />
		</div>
		<slot />
		<img class="m-auto block opacity-100 md:hidden md:opacity-0" src={icons[icon]} alt="bg-icon" />
	</div>
</div>
