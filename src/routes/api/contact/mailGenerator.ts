export const mailGenerator = (html: string, email: EmailHTMLGenerator) =>
	replaceables(email).reduce(
		(html, replaceable) => html.replaceAll(replaceable.search, replaceable.replace),
		html
	)

const replaceables = (email: EmailHTMLGenerator) =>
	[
		{
			search: '$HOME_URL_TEXT',
			replace: 'ThunderLite',
		},
		{
			search: '$HOME_URL_HREF',
			replace: siteUrl(),
		},
		{
			search: '$LOGO_FULL_COLOR',
			replace: `${siteUrl()}/images/haja/logo_horizontal_full.png`,
		},
		{
			search: '$LOGO_SMALL_COLOR',
			replace: `${siteUrl()}/images/haja/logo_full.png`,
		},
		{
			search: '$WHITE_LOGO_IMAGE',
			replace: `${siteUrl()}/images/haja/logo_horizontal_white.png`,
		},
		{
			search: '$IMAGE_CALENDAR',
			replace: `${siteUrl()}/emails/images/calendar.png`,
		},
		{
			search: '$IMAGE_WORKSPACE',
			replace: `${siteUrl()}/emails/images/desktop.png`,
		},
		{
			search: '$SUPPORT_TYPE',
			replace: email.type,
		},
		{
			search: '$DATE_RECIEVED',
			replace: email.date,
		},
		{
			search: '$SENDER_EMAIL',
			replace: email.email,
		},
		{
			search: '$MESSAGE_SUBJECT',
			replace: email.subject,
		},
		{
			search: '$SENT_MESSAGE',
			replace: email.text,
		},
		{
			search: '$ISSUE_URL_HREF',
			replace: `${siteUrl()}/emails/${email.ticket}`,
		},
		{
			search: '$ISSUE_ID',
			replace: email.ticket,
		},
	] as { search: string; replace: string }[]

export const clense = (message: string) => message

const siteUrl = () => `https://haja-web.vercel.app`
