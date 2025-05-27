<script lang="ts">
    import { _ } from 'svelte-i18n';
    import Track from './Track.svelte'; // Import the Track component
</script>

<section class="p-4 border rounded-lg shadow-md bg-white">
    <h2 class="text-xl font-semibold mb-4">{$_('sample_table_title')}</h2>
    <p class="text-gray-700">{$_('sample_table_description')}</p>
    <!-- Placeholder for sample data table -->
    <div class="mt-4 bg-gray-100 p-3 rounded">
        <p class="text-gray-600">{$_('sample_table_content_placeholder')}</p>
        <!-- Add Track components here -->
        <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
            <Track trackNumber={1} />
            <Track trackNumber={2} />
            <Track trackNumber={3} />
            <Track trackNumber={4} />
        </div>
    </div>
</section>
