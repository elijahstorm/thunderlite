import { addToast } from 'as-toast'

export type PublishResult = { id: string }

/**
 * Persist a map to the user's library. Passing an `id` (a map's `public_id` the
 * user owns) updates that row in place — mutable maps keep one stable link
 * across edits; omitting it creates a new map (subject to the per-user quota).
 * Returns the map's id, or null when the upload failed (a toast explains why).
 */
export const publishMap = async (
	encoded: string,
	thumbnail: string,
	{ id, name }: { id?: string; name?: string } = {}
): Promise<PublishResult | null> => {
	try {
		const response = await fetch(`/api/upload`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-sveltekit-action': 'true',
			},
			body: JSON.stringify({ id, name, encoded, thumbnail }),
		})

		const data = await response.json().catch(() => null)

		if (!response.ok || !data?.id) {
			addToast(data?.message ?? 'Could not save map.', 'warn')
			return null
		}
		return { id: data.id }
	} catch (error) {
		addToast(`Error saving map. ${error}`, 'warn')
		return null
	}
}

/**
 * Share (or copy) the public link to a saved map. `id` is the map's `public_id`;
 * recipients land on the map's view/play page rather than the authoring editor.
 */
export const shareLink = async (id: string, name: string) => {
	// Absolute URL so the shared/copied link works when pasted anywhere, not just
	// when already on the site.
	const url = new URL(`/map/${id}`, window.location.origin).href

	if (navigator.share) {
		try {
			await navigator.share({ title: name, text: 'A game!', url })
			addToast('Shared successfully')
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') return
			addToast(`Error sharing: ${error}`, 'warn')
		}
		return
	}

	try {
		await navigator.clipboard.writeText(url)
	} catch {
		const tempInput = document.createElement('input')
		tempInput.value = url
		document.body.appendChild(tempInput)
		tempInput.select()
		document.execCommand('copy')
		document.body.removeChild(tempInput)
	}
	addToast('Copied link to clipboard')
}
