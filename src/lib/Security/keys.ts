export const KEY_SOURCE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const generateKey = (length: number = 16) =>
	new Array(length)
		.fill('')
		.map(() => KEY_SOURCE[Math.floor(Math.random() * KEY_SOURCE.length)])
		.join('')
