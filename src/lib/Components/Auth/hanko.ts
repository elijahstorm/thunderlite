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

const setLoggedIn = () => loggedIn.set(true)
const setLoggedOut = () => loggedIn.set(false)

hanko.onAuthFlowCompleted(setLoggedIn)
hanko.onSessionCreated(setLoggedIn)
hanko.onSessionExpired(setLoggedOut)
hanko.onUserLoggedOut(setLoggedOut)
hanko.onUserDeleted(setLoggedOut)

const reportError = () => addToast('Error loading Hanko', 'warn')
