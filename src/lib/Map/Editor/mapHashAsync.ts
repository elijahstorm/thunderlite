import { browser } from '$app/environment'
import { exportMapData } from './mapExporter'

/**
 * Compute the base62 share/save hash of a map without blocking the main thread.
 *
 * The base62 encode (base-x) is O(n^2) in map size, so on a large board it can
 * take tens of seconds — fine for a one-off Save/Share click, but only if it
 * runs off-thread. We do the cheap linear JSON serialize here and hand the string
 * to a worker for the quadratic encode. The result is identical to the
 * synchronous {@link mapHasher}, so the on-disk/URL format is unchanged.
 *
 * (Autosave drafts and in-memory clones deliberately avoid base62 entirely — see
 * editorDraft — so this is only used where a URL/DB-safe hash is actually needed.)
 */

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (hash: string) => void>()

const ensureWorker = (): Worker => {
	if (worker) return worker
	worker = new Worker(new URL('./mapHashWorker.ts', import.meta.url), { type: 'module' })
	worker.onmessage = (event: MessageEvent<{ id: number; hash: string }>) => {
		const resolve = pending.get(event.data.id)
		pending.delete(event.data.id)
		resolve?.(event.data.hash)
	}
	return worker
}

export const mapHasherAsync = async (map: MapObject): Promise<string> => {
	// SSR or a browser without Worker support: fall back to the synchronous encode
	// (dynamically imported so base-x isn't pulled onto this path unless needed).
	if (!browser || typeof Worker === 'undefined') {
		const { mapHasher } = await import('./mapExporter')
		return mapHasher(map)
	}
	const json = exportMapData(map)
	return new Promise((resolve) => {
		const id = ++seq
		pending.set(id, resolve)
		ensureWorker().postMessage({ id, json })
	})
}
