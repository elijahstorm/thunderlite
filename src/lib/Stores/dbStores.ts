import { writable } from 'svelte/store'

export const dbUsersStore = writable<UserDBData[]>([])
export const dbMapsStore = writable<MapDBData[]>([])
