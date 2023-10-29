type EmailHTMLGenerator = {
	ticket: string
	date: string
	type: string
	email: string
	subject: string
	text: string
}

type CarrierPayload = {
	subject: string
	text: string
	html: string
}
type EmailConfiguration = CarrierPayload & {
	ticket: string
	type: string
	email: string
}

type MessageDataGetter = () => CarrierPayload
type PrepareMessageData = (data: CarrierPayload) => MessageDataGetter
