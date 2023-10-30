<script lang="ts">
	import LoginLogoutButton from '$lib/Components/Auth/LoginLogoutButton.svelte'
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
			<div class="flex flex-col gap-7 pb-1 justify-between md:justify-self-start md:col-span-3">
				<a
					class="flex flex-col items-center justify-center gap-3 md:hidden"
					href="/"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Logo width={116} height={30} url="" icon="/images/logo/white-small-tank.png" />
					<Logo width={116} height={30} url="/images/logo/white-small.png" icon="" />
				</a>

				<a class="hidden md:contents" href="/" target="_blank" rel="noopener noreferrer">
					<Logo
						width={116}
						height={30}
						url="/images/logo/white-small.png"
						icon="/images/logo/white-small-tank.png"
					/>
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
				class="items-end grid grid-cols-1 gap-2 py-1 text-white text-sm md:text-left md:grid-flow-col-dense md:justify-self-start md:grid-rows-3 md:py-0 md:w-full md:col-span-5 lg:gap-x-24 lx:col-span-3"
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

			<div class="hidden md:block md:col-span-1 lx:col-span-2"></div>

			<div
				class="flex flex-col justify-between gap-4 items-center md:items-end md:justify-self-end md:col-span-3"
			>
				<LoginLogoutButton />

				<div class="text-neutral-grayish-blue text-xs md:text-sm">
					<p>© ThunderLite Online</p>
					<p>All Rights Reserved</p>
				</div>
			</div>
		</div>
	</div>
</footer>
