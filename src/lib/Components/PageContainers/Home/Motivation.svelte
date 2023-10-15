<script lang="ts">
	const motivationItems = [
		{
			iconPath: "/icons/icon-onboarding.svg",
			title: "Fast Onboarding",
			subtitle:
				"Streamlined workflow for maximum efficiency. Accessible from any device, anywhere."
		},
		{
			iconPath: "/icons/icon-budgeting.svg",
			title: "Online Workflow",
			subtitle:
				"Improved communication and collaboration with centralized organization of projects and tasks"
		},
		{
			iconPath: "/icons/icon-api.svg",
			title: "Open AI API",
			subtitle:
				"Customizable to fit your team's unique needs. Increased accountability and transparency."
		},
		{
			iconPath: "/icons/icon-online.svg",
			title: "Simple Planning",
			subtitle: "Easy task delegation and management with real-time progress tracking."
		}
	]
</script>

<section class="py-14 bg-neutral-light-grayish-blue lg:py-24">
	<div class="container text-center lg:text-left">
		<div class="grid lg:grid-cols-2 mb-12 lg:mb-16">
			<div class="col-span-1">
				<h2 class="text-3xl lg:text-4xl text-primary-dark-blue pb-5">Why choose Haja?</h2>
			</div>
		</div>
		<div class="grid grid-cols-1 gap-9 lg:gap-6 lg:grid-cols-4">
			{#each motivationItems as item (item.iconPath)}
				<div class="justify-center">
					<div class="flex justify-center lg:justify-start">
						<img src={item.iconPath} alt="" />
					</div>

					<h2
						class="text-lg text-primary-dark-blue py-4 lg:pt-9 lg:pb-6 lg:text-xl lg:font-bold"
					>
						{item.title}
					</h2>
					<p class="text-neutral-grayish-blue text-sm font-light lg:text-base leading-5">
						{item.subtitle}
					</p>
				</div>
			{/each}
		</div>
	</div>
</section>
