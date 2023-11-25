<script lang="ts">
</script>

<div class="flex flex-col gap-4 p-4">
	<div class="w-full h-64 rounded-md overflow-hidden border-2 border-gray-300 bg-gray-200">
		<img class="w-full h-full object-cover" src="/images/embedded-card.png" alt="User Post" />
	</div>
	<div class="flex items-center gap-2">
		<button class="focus:outline-none">
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
				class=" h-6 w-6 text-gray-500 hover:text-gray-600 cursor-pointer"
			>
				<path
					d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
				>
				</path>
			</svg>
		</button>
		<button class="focus:outline-none">
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
				class=" h-6 w-6 text-gray-500 hover:text-gray-600 cursor-pointer"
			>
				<polyline points="9 17 4 12 9 7"> </polyline>
				<path d="M20 18v-2a4 4 0 0 0-4-4H4"> </path>
			</svg>
		</button>
		<button class="focus:outline-none">
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
				class=" h-6 w-6 text-gray-500 hover:text-gray-600 cursor-pointer"
			>
				<path d="m22 2-7 20-4-9-9-4Z"> </path>
				<path d="M22 2 11 13"> </path>
			</svg>
		</button>
		<button class="focus:outline-none ml-auto">
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
				class=" h-6 w-6 text-gray-500 hover:text-gray-600 cursor-pointer"
			>
				<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"> </path>
			</svg>
		</button>
	</div>
	<p class="text-sm text-gray-500">
		Liked by
		<strong class="font-medium text-gray-600"> user </strong>
		<!-- -->and<!-- --> <strong class="font-medium text-gray-600"> others </strong>
	</p>
	<div class="flex items-center gap-2">
		<strong class="font-medium text-gray-600"> user </strong>
		<p class="text-sm text-gray-500">Great post!</p>
	</div>
	<p class="text-xs text-gray-400">2 HOURS AGO</p>
</div>
