<script lang="ts">
	import { browser } from '$app/environment'
	import { writable, type Readable } from 'svelte/store'

	let loggedIn: Readable<boolean> = writable(false)

	if (browser) {
		import('$lib/Components/Auth/hanko').then((m) => (loggedIn = m.loggedIn))
	}
</script>

<div class="relative overflow-hidden">
	<section class="relative">
		<div
			class="absolute w-full h-full bg-no-repeat bg-top -top-12 lg:left-32"
			style="background-size: auto 60%; background-image: url('/images/embedded-card.png')"
		></div>
		<div class="container h-screen relative">
			<div class="h-full flex flex-col justify-end pb-4 lg:pb-0 lg:w-96 lg:justify-center">
				<div
					class="h-1/2 flex flex-col justify-center items-center text-center lg:items-start lg:text-left"
				>
					<a
						class="bg-primary-lime-green text-3xl px-12 py-4 rounded-full text-white bg-gradient-to-r from-primary-lime-green to-primary-bright-cyan hover:button-brightness mb-7 transition focus:outline-none focus:ring focus:ring-offset-2 focus:ring-green-400/80"
						href={$loggedIn ? '/play' : '/login'}
					>
						Get Started
					</a>
				</div>
			</div>
		</div>
	</section>
</div>
