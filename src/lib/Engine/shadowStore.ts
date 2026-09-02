import type { Writable, Subscriber, Unsubscriber, Updater } from 'svelte/store'

/**
 * A writable store that can be temporarily SHADOWED by a different value.
 *
 * The engine keeps match state in module-global stores (`gameState`, `smokeTiles`)
 * that every rule reads with `get(store)` and every action writes with
 * `store.update`. That is fine for the one live match, and fatal for a lookahead:
 * to ask "what does the board look like after this whole turn?" the CPU has to
 * apply actions to a hypothetical board, and every one of those writes would land
 * on the live match — and, worse, notify the HUD, the turn-scheduling effects and
 * the relay of a state that never happened.
 *
 * A shadow solves both halves. While one is installed:
 *  - reads (`get`, a fresh `subscribe`) see the shadow value;
 *  - writes (`set`, `update`) replace the shadow and notify NOBODY;
 *  - existing subscribers are untouched — they keep the last live value they were
 *    given and hear nothing until the shadow is lifted and the live value changes.
 *
 * A shadow is strictly synchronous: install it, run the simulation to completion,
 * lift it — never `await` in between, or UI code that runs in the gap reads a board
 * that does not exist. `withShadow` enforces that shape with try/finally.
 */
export type ShadowableStore<T> = Writable<T> & {
	/** Install `value` as the shadow; returns whatever shadow was there before (nesting). */
	installShadow: (value: T) => T | null
	/** Remove the shadow (restoring `previous` if nesting), and return the shadow's final value. */
	liftShadow: (previous: T | null) => T
	/** The live value, ignoring any shadow. */
	live: () => T
	/** True while a shadow is installed. */
	shadowed: () => boolean
}

let activeShadows = 0

/** True while ANY shadowable store is shadowed, i.e. a simulation is running. */
export const simulationActive = (): boolean => activeShadows > 0

export const shadowable = <T>(initial: T): ShadowableStore<T> => {
	let value = initial
	let shadow: { value: T } | null = null
	const subscribers = new Set<Subscriber<T>>()

	const set = (next: T): void => {
		if (shadow) {
			shadow.value = next
			return
		}
		value = next
		for (const run of [...subscribers]) run(next)
	}

	return {
		subscribe(run: Subscriber<T>): Unsubscriber {
			run(shadow ? shadow.value : value)
			subscribers.add(run)
			return () => {
				subscribers.delete(run)
			}
		},
		set,
		update(fn: Updater<T>): void {
			set(fn(shadow ? shadow.value : value))
		},
		installShadow(next: T): T | null {
			const previous = shadow ? shadow.value : null
			shadow = { value: next }
			activeShadows++
			return previous
		},
		liftShadow(previous: T | null): T {
			if (!shadow) throw new Error('shadowStore: liftShadow without an installed shadow')
			const final = shadow.value
			shadow = previous === null ? null : { value: previous }
			activeShadows--
			return final
		},
		live: () => value,
		shadowed: () => shadow !== null,
	}
}
