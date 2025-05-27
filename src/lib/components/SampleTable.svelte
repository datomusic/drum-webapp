<script lang="ts">
    import { _ } from 'svelte-i18n';
</script>

<section class="p-4 border rounded-lg shadow-md bg-white">
    <h2 class="text-xl font-semibold mb-4">{$_('sample_table_title')}</h2>
    <p class="text-gray-700">{$_('sample_table_description')}</p>
    <!-- Placeholder for sample data table -->
    <div class="mt-4 bg-gray-100 p-3 rounded">
        <p class="text-gray-600">{$_('sample_table_content_placeholder')}</p>
    </div>
</section>
