<script lang="ts">
	import LoginHeader from '$lib/Components/Auth/LoginHeader.svelte'
	import Logo from '$lib/Components/Branding/Logo.svelte'

	const iconSocialLinks = [
		{
			href: 'https://github.com/elijahstorm',
			icon: '/images/icons/github-mark-white.svg',
			alt: 'GitHub',
		},
	]

	const footerLinks = [
		{
			href: '/download',
			text: 'Download the App',
		},
		{
			href: '/about',
			text: 'About',
		},
		{
			href: '/contact',
			text: 'Contact Us',
		},
		{
			href: '/support',
			text: 'Support',
		},
		{
			href: '/privacy',
			text: 'Privacy Policy',
		},
		{
			href: 'http://elijahstorm.github.io/',
			text: 'More by Elijah',
		},
	]
</script>

<div class="flex-1 bg-slate-50">
	<slot />
</div>

<footer class="bg-primary-dark-blue py-10">
	<div class="container">
		<div class="text-center grid grid-cols-1 justify-items-center gap-6 md:grid-cols-12 lg:gap-0">
			<div class="flex flex-col justify-between md:col-span-4 lg:justify-self-start lg:col-span-3">
				<a class="contents" href="/" target="_blank" rel="noopener noreferrer">
					<Logo />
				</a>

				<div class="flex justify-center md:justify-between items-center gap-4">
					{#each iconSocialLinks as link (link.href)}
						<a class="contents" href={link.href} target="_blank" rel="noopener noreferrer">
							<img class="w-6 col-start-3 justify-self-end" src={link.icon} alt={link.alt} />
						</a>
					{/each}
				</div>
			</div>

			<div
				class="grid grid-cols-1 gap-2 py-1 text-white text-sm md:text-left md:justify-self-start md:grid-rows-4 md:col-span-5 lg:grid-rows-3 lg:col-span-5 lg:gap-x-24 lg:grid-flow-col-dense"
			>
				{#each footerLinks as link (link.href)}
					<a
						class="hover:text-green-400"
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
					>
						{link.text}
					</a>
				{/each}
			</div>

			<div
				class="flex flex-col justify-between gap-4 items-center md:items-end md:justify-self-end md:col-span-2 lg:col-span-4"
			>
				<LoginHeader />

				<p class="text-neutral-grayish-blue text-sm">© Haja. All Rights Reserved</p>
			</div>
		</div>
	</div>
</footer>
