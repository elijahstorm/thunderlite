import { Hanko, register } from '@teamhanko/hanko-elements'
import { PUBLIC_HANKO_API_URL } from '$env/static/public'
import { goto } from '$app/navigation'
import { writable } from 'svelte/store'
import { addToast } from 'as-toast'

const hanko = new Hanko(PUBLIC_HANKO_API_URL)

export const loggedIn = writable(false)

export const redirectAfterLogin = () => goto('/me')
export const redirectAfterLogout = () => goto('/login')

export const logout = () => hanko.user.logout().catch(reportError)
export const mountAuth = () => register(PUBLIC_HANKO_API_URL).catch(reportError)

hanko.onAuthFlowCompleted((authFlowCompletedDetail) => {
	// Login, registration or recovery has been completed successfully. You can now take control and redirect the
	// user to protected pages.
	console.info(
		`User successfully completed the registration or authorization process (user-id: "${authFlowCompletedDetail.userID}")`
	)
	loggedIn.set(true)
})

hanko.onSessionCreated((sessionDetail) => {
	// A new JWT has been issued.
	console.info(
		`Session created or updated (user-id: "${sessionDetail.userID}", jwt: ${sessionDetail.jwt})`
	)
	loggedIn.set(true)
})

hanko.onSessionExpired(() => {
	// You can redirect the user to a login page or show the `<hanko-auth>` element, or to prompt the user to log in again.
	console.info('Session expired')
	loggedIn.set(false)
})

hanko.onUserLoggedOut(() => {
	// You can redirect the user to a login page or show the `<hanko-auth>` element.
	console.info('User logged out')
	loggedIn.set(false)
})

hanko.onUserDeleted(() => {
	// You can redirect the user to a login page or show the `<hanko-auth>` element.
	console.info('User has been deleted')
	loggedIn.set(false)
})

const reportError = () => addToast('Error loading Hanko', 'warn')
