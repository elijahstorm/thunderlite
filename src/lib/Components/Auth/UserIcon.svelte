<script lang="ts">
	// import session from '$lib/firebase/session'
	// import { getUser, type UserContentConfig } from './UserContent'
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'

	export let user: { id: string; picture: string } | 'fallback' | null = null
	export let size: number = 2
	export let newTab = false

	let href: string
	let style: string
	$: href = user === 'fallback' ? '#' : user ? `/user/${user.id}` : '/'
	$: style = `width: ${size}rem; height: ${size}rem;`
</script>

<a class="contents" {href} target={newTab ? '_blank' : '_self'} rel="noreferrer">
	<div
		class="h-8 w-8 bg-white rounded-full border border-solid border-gray-600 overflow-hidden self-center cursor-pointer"
		{style}
	>
		{#if user === null}
			<!-- {#await getUser({ id: myId }) then user}
				{#if typeof user !== 'string'}
					<FallbackImage
						src={user.picture}
						alt="user profile"
						fallback="/images/icons/person.svg"
						cover
					/>
				{/if}
			{/await} -->
		{:else if user === 'fallback'}
			<FallbackImage alt="user profile" fallback="/images/icons/person.svg" cover />
		{:else}
			<FallbackImage
				src={user.picture}
				alt="user profile"
				fallback="/images/icons/person.svg"
				cover
			/>
		{/if}
	</div>
</a>
