<script lang="ts">
	import { _ } from 'svelte-i18n'; // Only need _ for translation, locale is handled in layout
</script>

<h1>{$_('welcome')}</h1>
<p>{@html $_('docs_link', { values: { link: `<a href="https://svelte.dev/docs/kit">${$_('docs_text')}</a>` } })}</p>

<p>{$_('greeting_message')}</p>
