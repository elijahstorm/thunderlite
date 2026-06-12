declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** DontCode user id of the signed-in user (set when the access_token cookie is valid). */
			user?: string
			/** Email address of the signed-in user. */
			userEmail?: string
			session?: string
			gameSession?: string
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {}
