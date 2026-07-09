import { addToast } from 'as-toast'
import { clearDraft, clearLastActiveMapId, getLastActiveMapId } from './editorDraft'

/**
 * Delete a saved map (a `public_id` the user owns) from their library.
 * Returns true on success; failures toast the server's reason and return false.
 *
 * Also sweeps the map's local editor traces — its autosave draft and, when it
 * was the last map worked on, the resume pointer — so a bare /editor visit
 * doesn't try to reopen a row that no longer exists.
 */
export const deleteMap = async (id: string): Promise<boolean> => {
	try {
		const response = await fetch(`/api/maps/${id}`, { method: 'DELETE' })
		if (!response.ok) {
			const data = await response.json().catch(() => null)
			addToast(data?.message ?? 'Could not delete map.', 'warn')
			return false
		}
	} catch (error) {
		addToast(`Error deleting map. ${error}`, 'warn')
		return false
	}

	clearDraft(id)
	if (getLastActiveMapId() === id) clearLastActiveMapId()
	return true
}
