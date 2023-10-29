// import { addDoc, collection, doc, getFirestore, setDoc } from "firebase/firestore"
// import { firebaseApp } from "$lib/firebase/firebase"

const OUR_EMAIL = import.meta.env.VITE_EMAIL_NAME

export const mailCarrier: (email: EmailConfiguration) => Promise<void> = ({
	type,
	ticket,
	email,
	subject,
	text,
	html,
}) => sendMail(ticket)(toSender(email, type)(getMessageData({ subject, text, html })))

const getMessageData: PrepareMessageData =
	({ subject, text, html }) =>
	() => ({
		subject,
		text,
		html,
	})

const toSender = (email: string, type: string) => (getData: MessageDataGetter) => ({
	to: [email, OUR_EMAIL],
	type,
	message: getData(),
})

const sendMail =
	(ticket: string) => async (data: { to: unknown[]; type: string; message: CarrierPayload }) =>
		console.error('Not implemented', ticket, data)
// setDoc(doc(getFirestore(firebaseApp), `mail/${ticket}`), data)

export const prepareTicketId = () => console.error('Not implemented')
// addDoc(collection(getFirestore(firebaseApp), "mail"), {})
