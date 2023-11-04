<script lang="ts">
	export let value: string
	export let id: string
	export let name: string
	export let type: 'textarea' | 'text' = 'text'
	export let placeholder: string
	export let label: string = ''
	export let message: string = ''
	export let icon: string | undefined = undefined
	export let showPrivacy: boolean = false

	export let required: boolean = false
	export let attempted: boolean = false
	export let invalid: boolean = false
	export let forceValid: boolean = false

	$: messageBefore = message.trimStart().split(' ')[0]
	$: messageAfter = message.trimStart().split(' ').slice(1).join(' ')
	$: iconHref = `background: url(${icon}); background-size: 1.5rem auto; background-repeat: repeat;`
</script>

<label
	for={name}
	class="block -mb-2 mt-4 pt-2 text-sm font-medium"
	class:text-gray-900={!invalid && !forceValid}
	class:dark:text-gray-100={!invalid && !forceValid}
	class:text-green-700={forceValid}
	class:dark:text-green-500={forceValid}
	class:text-red-700={invalid}
	class:dark:text-red-500={invalid}
>
	{label}
</label>

{#if type === 'textarea'}
	<textarea
		class="block my-4 p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
		class:bg-transparent={!invalid && !forceValid}
		class:border-brand-500={!invalid}
		class:bg-green-50={forceValid}
		class:border-green-700={forceValid}
		class:text-green-900={forceValid}
		class:placeholder-green-700={forceValid}
		class:bg-red-50={invalid}
		class:border-red-700={invalid}
		class:text-red-700={invalid}
		class:placeholder-red-700={invalid}
		class:invalid:bg-red-50={attempted}
		class:invalid:border-red-700={attempted}
		class:invalid:text-red-700={attempted}
		class:invalid:placeholder-red-700={attempted}
		rows="4"
		{id}
		{name}
		{required}
		{placeholder}
		bind:value
	/>
{:else}
	<div class="relative my-4 mx-0">
		{#if icon}
			<div class="input-icon absolute -mt-2 w-6 h-6 left-3 bottom-4" style={iconHref} />
		{/if}

		<input
			class="text-sm w-full rounded-lg border focus:bg-white focus:text-black focus:placeholder-gray-500 focus:border-black"
			class:p-2.5={!icon}
			class:p-4={icon}
			class:pl-14={icon}
			class:bg-transparent={!invalid && !forceValid}
			class:border-brand-500={!invalid}
			class:bg-green-50={forceValid}
			class:border-green-700={forceValid}
			class:text-green-900={forceValid}
			class:placeholder-green-700={forceValid}
			class:bg-red-50={invalid}
			class:border-red-700={invalid}
			class:text-red-700={invalid}
			class:placeholder-red-700={invalid}
			class:invalid:bg-red-50={attempted}
			class:invalid:border-red-700={attempted}
			class:invalid:text-red-700={attempted}
			class:invalid:placeholder-red-700={attempted}
			{id}
			{name}
			{required}
			{placeholder}
			type="text"
			bind:value
		/>
	</div>
{/if}

<p
	class="-mt-2 text-sm"
	class:text-gray-700={!invalid && !forceValid}
	class:dark:text-gray-200={!invalid && !forceValid}
	class:text-green-700={forceValid}
	class:dark:text-green-500={forceValid}
	class:text-red-700={invalid}
	class:dark:text-red-500={invalid}
>
	<span class="font-medium"> {messageBefore} </span>
	<span> {messageAfter} </span>
</p>

{#if showPrivacy}
	<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
		<span> We will never share your details. Read our </span>

		<a
			href="/privacy"
			class="border-transparent border-b text-blue-600 transition-colors hover:border-blue-600 focus:border-blue-600"
		>
			Privacy Policy
		</a>

		<span class="-ml-1"> . </span>
	</p>
{/if}

<style>
	.input-icon::after {
		content: '';
		position: absolute;
		right: -11px;
		top: -10px;
		bottom: -10px;
		width: 1px;
		opacity: 0.5;
		background-color: rgba(212, 212, 212, 0);
		background-image: -webkit-linear-gradient(
			bottom,
			rgba(212, 212, 212, 0) 0,
			#d4d4d4 30%,
			#d4d4d4 70%,
			rgba(212, 212, 212, 0) 100%
		);
		background-image: linear-gradient(
			to top,
			rgba(212, 212, 212, 0) 0,
			#d4d4d4 30%,
			#d4d4d4 70%,
			rgba(212, 212, 212, 0) 100%
		);
	}
</style>
