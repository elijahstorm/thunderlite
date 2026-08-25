import { readable, get, writable } from 'svelte/store'
import { browser } from '$app/environment'
import { SERVICE_BUSY_HEADER } from '$lib/Security/serviceBusy'

/**
 * What the client knows about the backend being rate limited.
 *
 * The backend meters each of its service namespaces on its own budget, so being
 * throttled is rarely an all-or-nothing thing. The server decides which of those
 * a player could actually notice and stamps the worst one onto every response as
 * `x-service-busy: <seconds>` (see hooks.server.ts). This side only has to
 * render it — the scope stays a server concern, because "which internal budget"
 * is not a thing to put in front of someone trying to finish a turn.
 *
 * What matters here is the number. An indefinite spinner reads as broken with no
 * end in sight; a countdown reads as scheduled, and people wait for it instead
 * of reloading and adding to the load that caused it.
 *
 * Because ANY request carries the header, there's nothing to poll and nothing to
 * wire per feature: one wrapper around `fetch` keeps this current app-wide.
 */

/** Epoch ms the backend should be usable again; 0 when we believe it's fine. */
const busyUntil = writable(0)

/**
 * Seconds remaining, ticking down once per second while busy and sitting at 0
 * otherwise. Readable-with-subscriber-start so the interval only exists while
 * something is actually rendering a countdown.
 */
export const serviceBusyFor = readable(0, (set) => {
	let timer: ReturnType<typeof setInterval> | null = null

	const tick = () => {
		const until = get(busyUntil)
		const left = Math.max(0, Math.ceil((until - Date.now()) / 1000))
		set(left)
		if (left === 0 && timer) {
			clearInterval(timer)
			timer = null
			if (until !== 0) busyUntil.set(0)
		}
	}

	const unsubscribe = busyUntil.subscribe(() => {
		tick()
		if (!timer && get(busyUntil) > Date.now()) timer = setInterval(tick, 1000)
	})

	return () => {
		unsubscribe()
		if (timer) clearInterval(timer)
	}
})

/**
 * Record a cooldown the backend reported. The longest known wait wins, so a
 * later response about a shorter one can't cut the countdown short — but zero
 * clears it outright, which is how recovery is signalled.
 */
export const noteServiceBusy = (seconds: number): void => {
	if (!Number.isFinite(seconds) || seconds <= 0) return
	const until = Date.now() + Math.min(seconds, 300) * 1000
	busyUntil.update((current) => (until > current ? until : current))
}

/** The backend answered normally, so whatever we thought we knew is stale. */
export const noteServiceRecovered = (): void => busyUntil.set(0)

/** True right now, for code that needs a one-shot answer rather than a store. */
export const isServiceBusy = (): boolean => get(busyUntil) > Date.now()

/**
 * Read the busy header off a response. Called by the global watcher below and
 * usable directly by anything holding a Response it fetched itself.
 *
 * Note what this deliberately does NOT do: clear the countdown when a response
 * comes back fine. Requests are spread across server instances and only the
 * instance that caught a 429 knows about it, so a clean response proves nothing
 * about the limit — acting on one would flicker the banner off and on for the
 * whole cooldown. The countdown came from the gateway's own `timeleft`, so
 * letting it run out is both simpler and more truthful.
 */
export const readServiceHealth = (response: Response): void => {
	const header = response.headers.get(SERVICE_BUSY_HEADER)
	if (header) noteServiceBusy(Number(header))
}

let installed = false

/**
 * Wrap `window.fetch` once so every request the app already makes reports the
 * backend's health, with no changes at the call sites.
 *
 * Chosen over threading a helper through several dozen fetches because it
 * cannot drift: a fetch added later is covered the day it's written. The
 * wrapper is strictly observational — it inspects headers on the way past and
 * returns the original response and the original rejection untouched, so no
 * caller can behave differently for having been wrapped.
 */
export const watchServiceHealth = (): void => {
	if (!browser || installed) return
	installed = true
	const original = window.fetch
	window.fetch = async (...args: Parameters<typeof fetch>) => {
		const response = await original(...args)
		try {
			// Same-origin only: another host's headers say nothing about our backend.
			if (response.type !== 'opaque' && response.type !== 'cors') readServiceHealth(response)
		} catch {
			// Health tracking must never interfere with the request it observed.
		}
		return response
	}
}
