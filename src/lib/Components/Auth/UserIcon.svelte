<script lang="ts">
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'

	export let id: string | null = null
	export let user: UserDBData | null = null
	export let size: number = 2
	export let newTab = false

	const fallback = 'https://cdn4.iconfinder.com/data/icons/small-n-flat/24/user-alt-512.png'

	let href: string
	let style: string
	$: href = user ? `/user/${user.id}` : '/'
	$: style = `width: ${size}rem; height: ${size}rem;`

	const fetchUserData = (userId: string) =>
		fetch(`/api/user/${userId}`)
			.then((res) => res.json())
			.then((data) => {
				if (data.user) {
					user = user
				}
			})

	$: {
		if (typeof id === 'string') {
			fetchUserData(id)
		}
	}
</script>

<a class="contents" {href} target={newTab ? '_blank' : '_self'} rel="noreferrer">
	<div
		class="h-8 w-8 bg-white rounded-full border border-solid border-gray-600 overflow-hidden self-center cursor-pointer"
		{style}
	>
		<FallbackImage src={user?.profile_image_url} alt="user profile" {fallback} cover />
	</div>
</a>
