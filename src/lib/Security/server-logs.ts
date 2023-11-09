import { VERCEL_ENV } from '$env/static/private'
import type { VercelPool } from '@vercel/postgres'

export const logToErrorDb = (pool: VercelPool) => async (e: unknown, info?: string) => {
	if (VERCEL_ENV === 'development') {
		console.error(e)
		return
	}

	let message: string
	if (e instanceof Error) {
		message = e.message
	} else if (typeof e !== 'string') {
		message = `${e}`
	} else {
		message = e ?? 'Unknown error'
	}

	try {
		await pool.query(
			`INSERT INTO Logs (type, message, time) VALUES ('error', '${
				info ? info + ': ' : ''
			}${message}', '${formatPostgresDate(new Date())}')`
		)
	} catch (msg) {
		// big system failure here... maybe send alert?
		console.error('!!AVOIDED SYSTEM CRASH!!', 'Could not save error log')
		console.error(msg)
	}
}

const formatPostgresDate = (date: Date) => {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0') // Months are 0-based
	const day = String(date.getDate()).padStart(2, '0')
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')
	const seconds = String(date.getSeconds()).padStart(2, '0')

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}
