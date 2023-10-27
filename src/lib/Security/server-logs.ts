import type { VercelPool } from '@vercel/postgres'

export const logToErrorDb = (pool: VercelPool) => (e: unknown, info?: string) => {
	let message: string
	if (e instanceof Error) {
		message = e.message
	} else if (typeof e !== 'string') {
		message = `${e}`
	} else {
		message = 'Unknown error'
	}

	pool.query(
		`INSERT INTO Logs (type, message, time) VALUES ('error', '${
			info ? info + ': ' : ''
		}${message}', '${formatPostgresDate(new Date())}')`
	)
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
