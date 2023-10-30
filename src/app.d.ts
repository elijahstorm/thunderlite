// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: string
			session?: string
			gameSession?: string
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {}
