import type { PageLoad } from './$types'

export const load: PageLoad = ({ params }) => ({ mapHash: params.mapHash })
