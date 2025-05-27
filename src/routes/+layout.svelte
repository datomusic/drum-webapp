<script lang="ts">
	import '../app.css';
	import '../i18n'; // Import the i18n setup file to initialize svelte-i18n
	
	let { children } = $props();
</script>

{@render children()}
