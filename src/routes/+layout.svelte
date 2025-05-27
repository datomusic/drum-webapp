<script lang="ts">
	import '../app.css';
	import '../i18n'; // Import the i18n setup file to initialize svelte-i18n
	import { _ } from 'svelte-i18n'; // Import _ for translation in the layout
	
	let { children } = $props();
</script>

<header>
	<nav>
		<h1>{$_('app_title')}</h1>
		<!-- Add navigation links here if needed -->
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

	nav h1 {
		margin: 0;
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
