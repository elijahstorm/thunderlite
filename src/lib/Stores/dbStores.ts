import { writable } from 'svelte/store'

export const dbUsersStore = writable<{ [key: string]: UserDBData }>({})
export const dbMapsStore = writable<{ [key: number]: MapDBData }>({})
