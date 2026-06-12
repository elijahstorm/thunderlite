import { Hanko, register, type SessionDetail } from '@teamhanko/hanko-elements'
import { PUBLIC_HANKO_API_URL } from '$env/static/public'
import { goto } from '$app/navigation'
import { writable } from 'svelte/store'
import { addToast } from 'as-toast'

export const hanko = new Hanko(PUBLIC_HANKO_API_URL)

const initialToken = (() => {
	try {
		return hanko.getSessionToken() || null
	} catch {
		return null
	}
})()

// Synchronously pull the user_id from the JWT subject so the header doesn't
// flash "Login" while the async hanko.getUser() call is in flight.
const decodeJwtSubject = (token: string): string | null => {
	try {
		const payload = token.split('.')[1]
		if (!payload) return null
		const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
		const json = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))
		return (json.subject ?? json.sub) || null
	} catch {
		return null
	}
}

export const loggedIn = writable<boolean>(!!initialToken)
export const userAuth = writable<string | null>(
	initialToken ? decodeJwtSubject(initialToken) : null
)

export const redirectAfterLogin = () => goto('/onboarding')
export const redirectAfterLogout = () => goto('/login')

const reportError = () => addToast('Error loading Hanko', 'warn')

export const logout = () => hanko.logout().catch(reportError)
export const mountAuth = () => register(PUBLIC_HANKO_API_URL).catch(reportError)

const setLoggedIn = (detail?: SessionDetail) => {
	loggedIn.set(true)
	const subject = detail?.claims?.subject
	if (subject) userAuth.set(subject)
}

const setLoggedOut = () => {
	loggedIn.set(false)
	userAuth.set(null)
}

hanko.onSessionCreated(setLoggedIn)
hanko.onSessionExpired(setLoggedOut)
hanko.onUserLoggedOut(setLoggedOut)
hanko.onUserDeleted(setLoggedOut)

// onSessionCreated only fires on the SDK's 30s session-check interval or via
// cross-tab BroadcastChannel, so it's not reliable for prompt in-tab updates.
// Mirror the same store update from the flow's `success` state.
hanko.onAfterStateChange((detail) => {
	if (detail.state?.name !== 'success') return
	const claims = (detail.state as { payload?: { claims?: { subject?: string } } }).payload?.claims
	setLoggedIn(claims ? ({ claims, expirationSeconds: 0 } as SessionDetail) : undefined)
})

if (initialToken) {
	hanko
		.getUser()
		.then((u) => userAuth.set(u.user_id))
		.catch(() => {})
}
