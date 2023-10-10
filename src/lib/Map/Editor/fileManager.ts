import { addToast } from 'as-toast'

const app = {
	file: {
		handle: null,
	},
	modified: false,
	map: {
		title: 'rose gold',
	},
}

export const save = async (content: string) => {
	if (!app.file.handle) {
		return await saveFileAs(content)
	}
	await writeFile(app.file.handle, content)
	app.modified = false
}

export const open = (callback: (content: string | null) => void) => {
	// Input element to select a file
	const fileInput = document.createElement('input')
	fileInput.type = 'file'

	// Listen for the 'change' event when a file is selected
	fileInput.addEventListener('change', function () {
		const selectedFile = fileInput.files[0]

		if (selectedFile) {
			const reader = new FileReader()

			// Define a callback function to handle the file content
			reader.onload = function (event) {
				const fileContent = event.target.result
				callback(fileContent)
			}

			// Read the file as text
			reader.readAsText(selectedFile)
		} else {
			addToast('No file selected.', 'warn')
		}
	})

	// Trigger the file input dialog
	fileInput.click()
}

const getNewFileHandle = async () => {
	// For Chrome 86 and later...
	if ('showSaveFilePicker' in window) {
		const opts = {
			suggestedName: app.map?.title,
			types: [
				{
					description: 'Text file',
					accept: { 'text/plain': ['.txt'] },
				},
			],
		}
		return window.showSaveFilePicker(opts)
	}
	// For Chrome 85 and earlier...
	const opts = {
		type: 'save-file',
		accepts: [
			{
				description: 'Text file',
				extensions: ['txt'],
				mimeTypes: ['text/plain'],
			},
		],
	}
	return window.chooseFileSystemEntries(opts)
}

const saveFileAs = async (textContent: string) => {
	let fileHandle
	try {
		fileHandle = await getNewFileHandle()
	} catch (ex) {
		if (ex.name === 'AbortError') {
			return
		}
		const msg = 'An error occured trying to open the file.'
		addToast(`${msg}, ${ex}`, 'warn')
		alert(msg)
		return
	}
	try {
		await writeFile(fileHandle, textContent)
		app.file.handle = fileHandle
		app.modified = false
	} catch (ex) {
		const msg = 'Unable to save file.'
		addToast(`${msg}, ${ex}`, 'warn')
		alert(msg)
		return
	}
}

const writeFile = async (fileHandle: FileSystemFileHandle, contents: string) => {
	// Support for Chrome 82 and earlier.
	if (fileHandle.createWriter) {
		// Create a writer (request permission if necessary).
		const writer = await fileHandle.createWriter()
		// Write the full length of the contents
		await writer.write(0, contents)
		// Close the file and write the contents to disk
		await writer.close()
		return
	}
	// For Chrome 83 and later.
	// Create a FileSystemWritableFileStream to write to.
	const writable = await fileHandle.createWritable()
	// Write the contents of the file to the stream.
	await writable.write(contents)
	// Close the file and write the contents to disk.
	await writable.close()
}
