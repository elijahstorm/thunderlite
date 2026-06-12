/**
 * Client-side session state, backed by the DontCode auth API through the
 * local /api/auth/* routes. The access token itself lives in an httpOnly
 * cookie — the browser never sees it, only whether a user is signed in.
 *
 * Drop-in successor to the old `hanko.ts` store: exports the same
 * `loggedIn` / `userAuth` stores and redirect helpers.
 */
import { browser } from '$app/environment'
import { goto } from '$app/navigation'
import { writable } from 'svelte/store'

export interface SessionUser {
	id: string
	email: string | null
}

export const loggedIn = writable<boolean>(false)
export const userAuth = writable<string | null>(null)

export const redirectAfterLogin = () => goto('/onboarding')
export const redirectAfterLogout = () => goto('/login')

const setSession = (user: SessionUser) => {
	loggedIn.set(true)
	userAuth.set(user.id)
}

const clearSession = () => {
	loggedIn.set(false)
	userAuth.set(null)
}

/** Re-sync the stores with the server's view of the session. */
export const refreshSession = async (): Promise<SessionUser | null> => {
	try {
		const response = await fetch('/api/auth/me')
		const data = await response.json()
		if (data.user?.id) {
			setSession(data.user)
			return data.user
		}
	} catch {
		// Treat network failures as signed out.
	}
	clearSession()
	return null
}

export const logout = async () => {
	try {
		await fetch('/api/auth/logout', { method: 'POST' })
	} finally {
		clearSession()
	}
}

if (browser) {
	refreshSession()
}
