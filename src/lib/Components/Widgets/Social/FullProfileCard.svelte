<script lang="ts">
	import FallbackImage from '../Images/FallbackImage.svelte'

	export let user: UserDBData

	const follow = () => {}

	const message = () => {}
</script>

<div
	class="border bg-white rounded-lg overflow-hidden shadow-lg max-w-sm mx-auto transition-all duration-200hover:shadow-xl"
>
	<FallbackImage
		src={user.profile_image_url}
		alt="User Profile"
		tailwind="object-cover w-full"
		style="aspect-ratio:320/320;object-fit:cover"
	/>
	<div class="p-4">
		<h2 class="text-2xl font-bold hover:text-gray-700 transition-all duration-200">
			{user.display_name ?? 'No Name'}
		</h2>
		<h3 class="text-gray-500 hover:text-gray-600 transition-all duration-200">
			@{user.username ?? 'anonymous'}
		</h3>
		<p class="mt-2 text-gray-600 hover:text-gray-700 transition-all duration-200">
			{user.bio ?? 'No bio'}
		</p>
		<div class="flex mt-4 space-x-2">
			<button
				class="inline-flex items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground h-9 rounded-md px-3 w-full hover:bg-gray-700 hover:text-white transition-all duration-200"
				on:click={follow}
			>
				Follow
			</button>
			<button
				class="inline-flex items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent h-9 rounded-md px-3 w-full hover:border-gray-700 hover:text-gray-700 transition-all duration-200"
				on:click={message}
			>
				Message
			</button>
		</div>
	</div>
</div>
