/**
 * `game_member.pubkey` — the seat's frame-signing public key, as JWK text.
 *
 * Live frames are published by the acting client straight to the room's socket
 * channel, and the realtime service relays them without saying who sent them.
 * Each browser therefore signs its frames with a key it generates for the match
 * and registers here (see `Security/frameSigning.ts`); the other clients read
 * the key with the roster and verify before they apply, and the server can
 * verify a turn a witness hands it against the actor's key. NULL until the
 * player's client has registered, or for a CPU seat, which never publishes.
 */
export const CreateGameMemberKey = `
alter table game_member add column if not exists pubkey text;
`
