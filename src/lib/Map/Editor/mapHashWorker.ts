/// <reference lib="webworker" />

// Off-main-thread base62 encode for the map share/save hash. base-x is a
// big-integer base conversion — O(n^2) in the serialized map size — so encoding
// a large board (a 100x100 map is ~30s of CPU) would freeze the UI if run on the
// main thread. The main thread does the cheap linear JSON serialize and hands the
// string here; this worker pays the quadratic cost without blocking input.
//
// The alphabet is duplicated from mapExporter's `hash` (base62.encode of the
// UTF-8 bytes) so the produced hash is byte-for-byte identical to the synchronous
// path — existing share links and DB rows keep their format.

import baseX from 'base-x'
import { KEY_SOURCE } from '$lib/Security/keys'

const base62 = baseX(KEY_SOURCE)

self.onmessage = (event: MessageEvent<{ id: number; json: string }>) => {
	const { id, json } = event.data
	const hash = base62.encode(new TextEncoder().encode(json))
	;(self as DedicatedWorkerGlobalScope).postMessage({ id, hash })
}
