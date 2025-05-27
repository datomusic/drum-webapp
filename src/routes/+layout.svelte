<script lang="ts">
	import '../app.css';
	import '../i18n'; // Import the i18n setup file to initialize svelte-i18n
	import { _, locale } from 'svelte-i18n'; // Import _ and locale for translation and language switching
	
	let { children } = $props();

	// Define available locales
	const locales = [
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' },
		{ code: 'de', name: 'Deutsch' },
		{ code: 'nl', name: 'Nederlands' }
	];
</script>

<header>
	<nav>
		<h1>{$_('app_title')}</h1>
		<div class="language-switcher">
			<label for="language-select">{$_('current_locale', { values: { locale: $locale } })}</label>
			<select id="language-select" bind:value={$locale}>
				{#each locales as lang}
					<option value={lang.code}>{lang.name}</option>
				{/each}
			</select>
		</div>
	</nav>
</header>

<main>
	{@render children()}
</main>

<footer>
	<p>&copy; {new Date().getFullYear()} {$_('app_name')}</p>
</footer>

<style>
	header {
		background-color: #333;
		color: white;
		padding: 1rem;
		text-align: center;
	}

	nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		max-width: 960px;
		margin: 0 auto;
	}

	nav h1 {
		margin: 0;
	}

	.language-switcher {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.language-switcher label {
		font-size: 0.9em;
	}

	.language-switcher select {
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
		border: none;
		background-color: #555;
		color: white;
		cursor: pointer;
	}

	main {
		padding: 1rem;
		min-height: calc(100vh - 120px); /* Adjust based on header/footer height */
	}

	footer {
		background-color: #eee;
		padding: 1rem;
		text-align: center;
		color: #555;
	}
</style>
