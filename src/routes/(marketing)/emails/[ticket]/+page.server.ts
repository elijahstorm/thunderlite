// import type { PageServerLoad } from "./$types"
// import { error } from "@sveltejs/kit"
// import { ErrorMessaging } from "$lib/firebase/errors"
// import { loginWithInfo } from "$lib/firebase/auth"
// import { doc, getDoc, getFirestore } from "firebase/firestore"
// import { firebaseApp } from "$lib/firebase/firebase"

// export const load: PageServerLoad = async ({ params }) => {
// 	const { ticket } = params

// 	try {
// 		await loginWithInfo("elijahstormai@gmail.com", "tester")

// 		const messageDetails = (
// 			await getDoc(doc(getFirestore(firebaseApp), `mail/${ticket}`))
// 		).data()

// 		if (!messageDetails) {
// 			throw error(405, "we could not find the ticket you requested")
// 		}

// 		const { message } = messageDetails

// 		return { message }
// 	} catch (e) {
// 		throw error(504, {
// 			message: ErrorMessaging(e.code),
// 		})
// 	}
// }
