<script lang="ts">
	import { _, locale } from 'svelte-i18n';
</script>

<h1>{$_('welcome')}</h1>
<p>{@html $_('docs_link', { values: { link: `<a href="https://svelte.dev/docs/kit">${$_('docs_text')}</a>` } })}</p>

<p>{$_('greeting_message')}</p>

<p>{$_('current_locale', { values: { locale: $locale } })}</p>
<button on:click={() => $locale = 'en'}>{$_('switch_to_en')}</button>
<button on:click={() => $locale = 'es'}>{$_('switch_to_es')}</button>
<button on:click={() => $locale = 'de'}>{$_('switch_to_de')}</button>
<button on:click={() => $locale = 'nl'}>{$_('switch_to_nl')}</button>
