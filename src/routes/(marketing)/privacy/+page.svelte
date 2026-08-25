<script lang="ts">
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import Icon from '@iconify/svelte'

	const CONTACT = 'privacy@dontcode.co'
	const DONTCODE_PRIVACY = 'https://www.dontcode.co/en/legal/privacy'
	const lastUpdated = 'July 8, 2026'

	// Third parties that actually touch ThunderLite data. DontCode runs the
	// backend, so its own subprocessors (Supabase, Vercel) are covered in full
	// by its policy, linked below.
	const processors = [
		{
			name: 'DontCode',
			role: 'Backend platform: accounts, database, realtime multiplayer, and hosting. ThunderLite is built on and sponsored in full by DontCode.',
		},
		{
			name: 'Supabase',
			role: 'Database, authentication, and realtime services, used by DontCode on our behalf.',
		},
		{
			name: 'Vercel',
			role: 'Application hosting and edge delivery.',
		},
	]

	const rights = [
		{
			title: 'Access',
			body: 'Ask for a copy of the account and profile data we hold about you.',
		},
		{
			title: 'Deletion',
			body: 'Delete your account, along with your maps, chats, and match history.',
		},
		{
			title: 'Correction',
			body: 'Update your email, username, display name, or avatar at any time from your settings.',
		},
		{
			title: 'Objection',
			body: 'Ask us to stop processing your information, or close your account and stop entirely.',
		},
	]
</script>

<Casing>
	<article class="max-w-3xl mx-auto py-8 space-y-6 text-muted-foreground leading-relaxed">
		<header class="space-y-4">
			<p class="section-eyebrow">Privacy</p>
			<h1 class="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground leading-tight">
				Privacy Policy
			</h1>
			<p class="text-sm text-muted-foreground">Last updated {lastUpdated}</p>
		</header>

		<div class="card p-6 flex gap-4 items-start">
			<div
				class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
			>
				<Icon icon="lucide:heart-handshake" width={20} />
			</div>
			<p class="text-sm leading-relaxed">
				ThunderLite is a free, browser-based tactics game built by
				<a href="http://elijahstorm.github.io/" class="link">Elijah Storm</a>. It is supported and
				sponsored in full by <a href={DONTCODE_PRIVACY} class="link">DontCode</a>, which also powers
				its accounts, database, and multiplayer. Because DontCode runs the backend, its
				<a href={DONTCODE_PRIVACY} target="_blank" rel="noopener noreferrer" class="link"
					>privacy policy</a
				> governs the underlying data handling, and this notice explains it in the context of the game.
			</p>
		</div>

		<p>
			This notice describes what we collect when you play ThunderLite at
			<a href="https://thunderlite.vercel.app/" class="link">thunderlite.vercel.app</a>, how we use
			it, and the choices you have. If you do not agree with it, please do not use the game.
			Questions? Email <a href="mailto:{CONTACT}" class="link">{CONTACT}</a>.
		</p>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">The short version</h2>
			<ul class="space-y-2">
				<li class="flex gap-3">
					<Icon icon="lucide:check" width={18} class="mt-0.5 shrink-0 text-primary" />
					<span>We collect the minimum needed to run an account and multiplayer game.</span>
				</li>
				<li class="flex gap-3">
					<Icon icon="lucide:check" width={18} class="mt-0.5 shrink-0 text-primary" />
					<span>We do not sell your data or use it for third-party advertising.</span>
				</li>
				<li class="flex gap-3">
					<Icon icon="lucide:check" width={18} class="mt-0.5 shrink-0 text-primary" />
					<span
						>ThunderLite is free. We do not process real payments or store payment card details.</span
					>
				</li>
				<li class="flex gap-3">
					<Icon icon="lucide:check" width={18} class="mt-0.5 shrink-0 text-primary" />
					<span>You can delete your account and its data at any time.</span>
				</li>
			</ul>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">
				1. Information we collect
			</h2>
			<p>We only collect information you give us or that the game needs to function:</p>
			<ul class="space-y-2 list-disc pl-5">
				<li>
					<span class="text-foreground font-medium">Account information</span> — your email address,
					username, and a securely hashed password when you register, or the details provided by your
					sign-in provider.
				</li>
				<li>
					<span class="text-foreground font-medium">Profile information</span> — an optional display
					name and avatar shown to other players.
				</li>
				<li>
					<span class="text-foreground font-medium">Gameplay data</span> — the maps you create, match
					history and stats, game sessions and lobbies you join, and your friends list.
				</li>
				<li>
					<span class="text-foreground font-medium">Chat messages</span> — direct messages and in-game
					chat you send to other players.
				</li>
				<li>
					<span class="text-foreground font-medium">Technical data</span> — a session identifier and
					basic logs needed to keep you signed in and to protect the game from abuse.
				</li>
			</ul>
			<p>
				We do not collect sensitive personal information, precise location, or payment card numbers,
				and we do not receive data about you from data brokers.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">
				2. How we use your information
			</h2>
			<ul class="space-y-2 list-disc pl-5">
				<li>To create your account, sign you in, and keep it working.</li>
				<li>To run multiplayer: matchmaking, lobbies, turns, chat, and leaderboards.</li>
				<li>To show your public profile, maps, and stats to other players.</li>
				<li>To keep the game secure and prevent abuse.</li>
				<li>To respond to your questions and support requests.</li>
			</ul>
			<p>
				We process your information only when we have a valid reason to: to provide the game you
				asked for, for our legitimate interest in running and securing it, or with your consent.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">
				3. Who processes your information
			</h2>
			<p>
				We do not sell or share your personal data for advertising. The services below process data
				on our behalf, under our instructions, and receive only what they need to do their job:
			</p>
			<div class="space-y-3">
				{#each processors as p (p.name)}
					<div class="card p-4">
						<p class="text-foreground font-medium">{p.name}</p>
						<p class="text-sm mt-1">{p.role}</p>
					</div>
				{/each}
			</div>
			<p>
				For full detail on how the backend handles data, including subprocessors and international
				transfers, see the
				<a href={DONTCODE_PRIVACY} target="_blank" rel="noopener noreferrer" class="link"
					>DontCode Privacy Policy</a
				>.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">4. How long we keep it</h2>
			<p>
				We keep your account data for as long as your account is active. When you delete your
				account, we remove your associated data, except anything we are required to keep by law.
				Basic security logs are kept for a limited period for fraud prevention.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">5. Your rights</h2>
			<p>Depending on where you live, you may have the right to:</p>
			<div class="grid sm:grid-cols-2 gap-4">
				{#each rights as r (r.title)}
					<div class="card p-5">
						<h3 class="font-semibold text-foreground">{r.title}</h3>
						<p class="text-sm mt-1">{r.body}</p>
					</div>
				{/each}
			</div>
			<p>
				To exercise any of these, email <a href="mailto:{CONTACT}" class="link">{CONTACT}</a> and we
				will respond within a reasonable time.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">6. Security</h2>
			<p>
				Data is encrypted in transit over HTTPS and at rest by our backend providers. Passwords are
				stored hashed, never in plain text. No system is perfectly secure, so we cannot guarantee
				absolute security, but we take reasonable technical and organizational steps to protect your
				information.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">7. Children</h2>
			<p>
				ThunderLite is not directed at children under 14, and we do not knowingly collect their
				personal information. If you believe a child has created an account, contact us at
				<a href="mailto:{CONTACT}" class="link">{CONTACT}</a> and we will remove it.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">
				8. Cookies and local storage
			</h2>
			<p>
				We use a first-party session cookie to keep you signed in and browser storage to remember
				preferences such as your last sign-in method. We do not use advertising or third-party
				tracking cookies. Blocking the session cookie will prevent you from signing in.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">
				9. Changes to this notice
			</h2>
			<p>
				We may update this notice from time to time. When we do, we will revise the "Last updated"
				date above. Significant changes will be highlighted in the game where appropriate.
			</p>
		</section>

		<section class="space-y-3 pt-4">
			<h2 class="text-2xl font-semibold tracking-tight text-foreground">10. Contact us</h2>
			<p>
				Questions about this notice or your data? Email
				<a href="mailto:{CONTACT}" class="link">{CONTACT}</a>. For questions about the underlying
				backend, see the
				<a href={DONTCODE_PRIVACY} target="_blank" rel="noopener noreferrer" class="link"
					>DontCode Privacy Policy</a
				>.
			</p>
		</section>
	</article>
</Casing>
