import { browser } from '$app/environment'
import { Hanko } from '@teamhanko/hanko-elements'
import { register } from '@teamhanko/hanko-elements'
import { addToast } from 'as-toast'
import { goto } from '$app/navigation'
import { PUBLIC_HANKO_API_URL } from '$env/static/public'

export const redirectAfterLogin = () => browser && goto('/me')
export const redirectAfterLogout = () => browser && goto('/login')

export const logout = () => new Hanko(PUBLIC_HANKO_API_URL).user.logout().catch(reportError)
export const mountAuth = () => register(PUBLIC_HANKO_API_URL).catch(reportError)

const reportError = () => addToast('Error loading Hanko', 'warn')
