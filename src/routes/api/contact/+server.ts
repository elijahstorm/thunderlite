import { error, json } from '@sveltejs/kit'
// import { loginWithInfo } from "$lib/firebase/auth"
// import { ErrorMessaging } from "$lib/firebase/errors"
import type { RequestHandler } from './$types'
import { mailCarrier, prepareTicketId } from './mailCarrier'
import { clense, mailGenerator } from './mailGenerator'

export const POST: RequestHandler = async ({ fetch, request }) => {
	const { type, email, subject, message } = await request.json()
	const date = new Date()
	const formattedDate = date.toDateString()
	const text = clense(message)

	if (!email || !subject || !message) {
		error(400, 'All fields must be supplied');
	}

	try {
		error(500, 'Not implemented');

		// await loginWithInfo("elijahstormai@gmail.com", "tester")

		const dataFetch = await Promise.all([
			prepareTicketId(),
			fetch('/emails/contact-confirmation.html'),
		])

		const ticket = dataFetch[0].id
		const renderHTML = await dataFetch[1].text()

		const html = mailGenerator(renderHTML, {
			ticket,
			type,
			email,
			subject,
			text,
			date: formattedDate,
		})

		await mailCarrier({ ticket, type, email, subject, text, html })

		return json({
			ticket,
			date,
			email,
			message: `
				Message successfuly sent at ${formattedDate}.
				Your ticket ID is #${ticket}.
				Check your emails for a confirmation message.
				We will respond as soon as possible.
			`,
		})
	} catch (e) {
		if (e instanceof Error || typeof e === 'string') {
			throw e
		} else if (e && typeof e === 'object' && Object.hasOwn(e, 'code')) {
			error(504, {
            				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
            				// @ts-ignore
            				message: e.code, // remove this when implementing emails
            				// message: ErrorMessaging(e.code),
            			});
		}
		throw e
	}
}
