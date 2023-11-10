import type postgres from 'postgres'

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			sql: postgres.Sql
			user?: string
			session?: string
			gameSession?: string
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {}
