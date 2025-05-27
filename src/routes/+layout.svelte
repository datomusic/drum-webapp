<script lang="ts">
	import '../app.css';
	import { _, locale } from 'svelte-i18n';
	
	let { children } = $props();

	const locales = [
		{ code: 'en', name: 'English' },
		{ code: 'de', name: 'Deutsch' },
		{ code: 'nl', name: 'Nederlands' }
	];
</script>

<header class="bg-white text-gray-800 p-4 text-center">
	<nav class="flex justify-between items-center max-w-screen-lg mx-auto">
		<h1 class="m-0">{$_('app_title')}</h1>
		<div class="flex items-center gap-2">
			<select
				id="language-select"
				bind:value={$locale}
				class="
					p-1.5 rounded-md border-none bg-gray-700 text-white cursor-pointer
					focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white
				"
			>
				{#each locales as lang}
					<option value={lang.code}>{lang.name}</option>
				{/each}
			</select>
		</div>
	</nav>
</header>

<main class="p-4 min-h-[calc(100vh-120px)]">
	{@render children()}
</main>

<footer class="bg-gray-200 p-4 text-center text-gray-600">
	<p>&copy; {new Date().getFullYear()} {$_('app_name')}</p>
</footer>

<style>
	/* No custom styles needed here anymore for the language switcher */
</style>
