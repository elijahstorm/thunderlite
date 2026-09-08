/**
 * The questions people actually type, answered in full sentences.
 *
 * These render on the page AND generate the FAQPage structured data, from this
 * one array, on purpose. Google penalises schema that describes content the
 * visitor cannot see, and an answer engine that quotes a Q&A which does not
 * exist on the page is a citation the reader bounces off. One source, both uses.
 *
 * Each answer is written to survive being lifted out of context: it names the
 * product, states the fact, and does not depend on the sentence before it.
 * That is the whole trick to being quotable by an LLM.
 */
export interface FaqItem {
	q: string
	a: string
}

export const HOME_FAQ: FaqItem[] = [
	{
		q: 'Is ThunderLite free to play?',
		a: 'Yes. ThunderLite is completely free, with no ads, no paywalls, and nothing locked behind a purchase. Optional one-time and monthly donations exist to help cover hosting, but they unlock no gameplay of any kind.',
	},
	{
		q: 'Do I need to download or install anything?',
		a: 'No. ThunderLite runs entirely in a web browser. There is no download, no installer, no plugin, and no Flash. Open the page and the game loads.',
	},
	{
		q: 'Do I need an account to play ThunderLite?',
		a: 'Not for single player. The campaign starts the moment the page loads, with no signup and no email. An account is only needed for multiplayer, since a match against another person needs somewhere to store the game between turns.',
	},
	{
		q: 'What game is ThunderLite based on?',
		a: 'ThunderLite is a from-scratch rebuild of Battalion: Arena, the Flash turn-based tactics game by Urban Squall that went offline in 2012. It sits in the same genre as Advance Wars and Wargroove: grid-based maps, funded properties, unit rock-paper-scissors, and no reflexes required.',
	},
	{
		q: 'Can I play ThunderLite multiplayer with a friend?',
		a: 'Yes, in two ways. Live matches share a room code and play out in one sitting with turn timers. Async matches let each side take a turn whenever they have a minute, over hours or days, with an email nudge when it is your move.',
	},
	{
		q: 'How large can ThunderLite maps get?',
		a: 'Up to 500x500 tiles. Around 100x100 is the practical sweet spot for a full match. The original Battalion: Arena engine struggled past roughly 20x20, which is the main reason the engine was rewritten rather than ported.',
	},
	{
		q: 'Can I make my own maps?',
		a: 'Yes. ThunderLite includes a map editor where you paint terrain and height, place units and buildings, script events and triggers, and publish the finished map for other players to fight over.',
	},
	{
		q: 'Does ThunderLite work on mobile?',
		a: 'It runs in a mobile browser and the board pans by touch, so a phone or tablet works for a quick match. A larger screen is easier once maps get big, since more of the front line fits on screen at once.',
	},
	{
		q: 'What makes the ThunderLite CPU different from a normal game AI?',
		a: 'The CPU scores the position rather than following a fixed script, weighing terrain, height, armor matchups, and only what it can actually see through fog of war. At higher difficulties it searches further ahead instead of simply being handed extra units or damage, so it cannot be beaten by memorising one opening.',
	},
	{
		q: 'Is ThunderLite open source?',
		a: 'Yes. The full source is on GitHub at github.com/elijahstorm/thunderlite. It is built and maintained by one developer, Elijah Storm, and sponsored by DontCode, which runs the accounts, database, and realtime multiplayer that keep it free.',
	},
]

export const BATTALION_FAQ: FaqItem[] = [
	{
		q: 'What happened to Battalion: Arena?',
		a: 'Battalion: Arena was a Flash turn-based strategy game by Urban Squall, played mostly on Kongregate. Its servers were shut down on April 1st, 2012, and the browser Flash plugin it depended on reached end of life in December 2020. There is no way to play the original online today.',
	},
	{
		q: 'Can you still play Battalion: Arena in 2026?',
		a: 'Not the original. The servers are gone and no modern browser runs Flash. ThunderLite is a free, from-scratch rebuild of the same game that runs in a normal browser tab, with the campaign playable without an account.',
	},
	{
		q: 'Is ThunderLite the same game as Battalion: Arena?',
		a: 'It is a rebuild, not a port or an emulator. The feel of the original is the target: grid maps, captured buildings funding your army, and unit matchups that decide fights before either side rolls. The engine underneath is new, which is what allows 500x500 maps, fog of war with terrain height, weather, hosted multiplayer, and a CPU that reacts instead of repeating a script.',
	},
	{
		q: 'What is a good Advance Wars alternative I can play in a browser?',
		a: 'ThunderLite is a free browser game in the Advance Wars family: turn-based grid tactics, no install, no account for single player, and both live and correspondence multiplayer against other people. It runs on any modern desktop or mobile browser.',
	},
	{
		q: 'Does ThunderLite cost anything or need Flash?',
		a: 'No to both. ThunderLite is free with no ads or paywalls, and it is built on standard web technology, so it needs no Flash, no plugin, and no download.',
	},
]
