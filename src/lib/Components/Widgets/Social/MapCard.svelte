<script lang="ts">
	import { dbUsersStore } from '$lib/Stores/dbStores'
	import MapThumbnail from './MapThumbnail.svelte'
	import UserImageAndName from './UserImageAndName.svelte'

	export let map: MapDBData

	const formatDate = (date: Date) => {
		const months = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec',
		]

		const hours = date.getHours()
		const minutes = date.getMinutes().toString().padStart(2, '0')
		const ampm = hours >= 12 ? 'PM' : 'AM'
		const month = months[date.getMonth()]
		const day = date.getDate()
		const year = date.getFullYear()

		return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm} · ${month} ${day}, ${year}`
	}
</script>

<div
	class="border text-card-foreground bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden"
>
	<div class="md:flex">
		<div class="md:flex-shrink-0">
			<span class="object-cover md:w-48 rounded-md bg-muted w-[192px] h-[192px]"> </span>
		</div>
		<div class="p-8 w-full">
			<div class="flex items-center justify-between">
				<UserImageAndName user={$dbUsersStore[map.owner_auth]} text />
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox={'-5 0 57 57'}
					fill="none"
					stroke="currentColor"
					stroke-width={5}
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-6 w-6 text-blue-500"
					class:fill-current={map.trending}
				>
					<path
						d="M26.285,2.486l5.407,10.956c0.376,0.762,1.103,1.29,1.944,1.412l12.091,1.757 c2.118,0.308,2.963,2.91,1.431,4.403l-8.749,8.528c-0.608,0.593-0.886,1.448-0.742,2.285l2.065,12.042 c0.362,2.109-1.852,3.717-3.746,2.722l-10.814-5.685c-0.752-0.395-1.651-0.395-2.403,0l-10.814,5.685 c-1.894,0.996-4.108-0.613-3.746-2.722l2.065-12.042c0.144-0.837-0.134-1.692-0.742-2.285l-8.749-8.528 c-1.532-1.494-0.687-4.096,1.431-4.403l12.091-1.757c0.841-0.122,1.568-0.65,1.944-1.412l5.407-10.956 C22.602,0.567,25.338,0.567,26.285,2.486z"
					/>
				</svg>
			</div>
			<p class="text-left text-md pt-4 truncate">
				<span class="font-medium tracking-wider">
					{map.name ?? 'Unnamed'}
				</span>
				{#if map.description}
					<span class="text-left text-md text-ellipsis opacity-80">
						- {map.description}
					</span>
				{/if}
			</p>
			<MapThumbnail {map} />
			<div class="flex mt-6 justify-between items-center">
				<div class="flex space-x-4 text-gray-400 dark:text-gray-300">
					<div class="flex items-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill={map.liked_by_me ? 'currentColor' : 'none'}
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-6 w-6 text-red-500"
						>
							<path
								d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
							>
							</path>
						</svg>
						<span class="ml-1 text-red-500"> {map.likes ?? 0} </span>
					</div>
					<div class="flex items-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="80 30 300 430"
							fill="none"
							stroke="currentColor"
							stroke-width="36"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-6 w-6 text-green-500"
						>
							<path
								d="M112,111V401c0,17.44,17,28.52,31,20.16l247.9-148.37c12.12-7.25,12.12-26.33,0-33.58L143,90.84C129,82.48,112,93.56,112,111Z"
							/>
						</svg>
						<span class="ml-1 text-green-500"> {map.plays} </span>
					</div>
					<div class="flex items-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-6 w-6 text-blue-500"
						>
							<path d="m17 2 4 4-4 4" />
							<path d="M3 11v-1a4 4 0 0 1 4-4h14" />
							<path d="m7 22-4-4 4-4" />
							<path d="M21 13v1a4 4 0 0 1-4 4H3" />
						</svg>
						<span class="ml-1 text-blue-500"> {map.shares ?? 0} </span>
					</div>
				</div>
				<div class="text-gray-400 dark:text-gray-300">
					{formatDate(map.created_at)}
				</div>
			</div>
		</div>
	</div>
</div>
