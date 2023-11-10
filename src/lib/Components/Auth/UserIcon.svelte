<script lang="ts">
	import { fly } from 'svelte/transition'
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'
	import FullProfileCard from '$lib/Components/Widgets/Social/FullProfileCard.svelte'

	export let id: string | null = null
	export let user: UserDBData | null = null
	export let size: number = 2

	const fallback = 'https://cdn4.iconfinder.com/data/icons/small-n-flat/24/user-alt-512.png'

	let floatingProfile: HTMLDivElement
	let shouldFlowUpwards = false
	let open = true
	let style: string
	$: style = `width: ${size}rem; height: ${size}rem;`

	const fetchUserData = (userId: string) =>
		fetch(`/api/user/${userId}`)
			.then((res) => res.json())
			.then((data) => {
				if (data.user) {
					user = data.user
				}
			})

	const openProfile = () => (open = !open)

	$: {
		if (typeof id === 'string') {
			fetchUserData(id)
		}
	}
</script>

<div class="relative">
	<button class="contents" on:click={openProfile}>
		<div
			class="h-8 w-8 bg-white rounded-full border border-solid border-gray-600 overflow-hidden self-center cursor-pointer"
			{style}
		>
			<FallbackImage src={user?.profile_image_url} alt="user profile" {fallback} cover />
		</div>
	</button>

	{#if open}
		<div
			class="absolute left-1/2 -translate-x-1/2 pt-1 shadow-xl z-50"
			bind:this={floatingProfile}
			class:bottom-10={shouldFlowUpwards}
			in:fly={{ y: -20, duration: 200 }}
			out:fly={{ y: -20, duration: 200 }}
		>
			{#if user}
				<FullProfileCard {user} />
			{/if}
		</div>
	{/if}
</div>
