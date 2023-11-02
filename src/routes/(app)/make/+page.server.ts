import type { PageServerLoad } from './$types'
import { queryMaps } from './queryMaps'

export const load: PageServerLoad = () => queryMaps({})
