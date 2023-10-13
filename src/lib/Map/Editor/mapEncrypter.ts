import { addToast } from 'as-toast'

const AdditionalData = 'AdditionalData'
const iv = crypto.getRandomValues(new Uint8Array(12))

type KeyDataPair = {
	key: CryptoKey
	encrypted: Uint8Array
}

export const hash = (content: string) => (resolve: (message: string) => void) =>
	sha256(content).then((message) => resolve(message))

export const encryptData = (resolve: (pair: KeyDataPair) => void) => (message: string) =>
	crypto.subtle
		.generateKey(
			{
				name: 'AES-GCM',
				length: 256,
			},
			true,
			['encrypt', 'decrypt']
		)
		.then((key) => {
			const encoder = new TextEncoder()
			crypto.subtle
				.encrypt(
					{
						name: 'AES-GCM',
						iv,
						additionalData: encoder.encode(AdditionalData),
					},
					key,
					encoder.encode(message)
				)
				.then((encrypted) => resolve({ key, encrypted: new Uint8Array(encrypted) }))
				.catch((error) => addToast(`Encryption error: ${error}`, 'warn'))
		})
		.catch((error) => addToast(`Key generation error: ${error}`, 'warn'))

export const decryptData = (resolve: (message: string) => void) => (pair: KeyDataPair) =>
	crypto.subtle
		.decrypt(
			{
				name: 'AES-GCM',
				iv,
				additionalData: new TextEncoder().encode(AdditionalData),
			},
			pair.key,
			pair.encrypted
		)
		.then((decrypted) => resolve(new TextDecoder().decode(decrypted)))
		.catch((error) => addToast(`Decryption error: ${error}`, 'warn'))

const sha256 = async (message: string) =>
	Array.from(
		new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message)))
	)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
