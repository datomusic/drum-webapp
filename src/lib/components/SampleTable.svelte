<script lang="ts">
    import { _ } from 'svelte-i18n';
    import Track from './Track.svelte'; // Import the Track component

    // Define a base set of colors to cycle through for the samples
    const baseColors = [
        '#FF0000', // Red
        '#FFA500', // Orange
        '#FFFF00', // Yellow
        '#008000', // Green
        '#0000FF', // Blue
        '#4B0082', // Indigo
        '#EE82EE', // Violet
        '#808080', // Gray
    ];

    // Generate sample data for all 32 slots (4 tracks * 8 samples)
    // MIDI notes will be sequential starting from 36 (C1)
    const allSamplesData = Array.from({ length: 32 }, (_, i) => ({
        color: baseColors[i % baseColors.length], // Cycle through base colors
        midiNoteNumber: 36 + i, // Sequential MIDI notes
    }));

    // Divide the allSamplesData into 4 arrays for each track
    const track1Samples = allSamplesData.slice(0, 8);
    const track2Samples = allSamplesData.slice(8, 16);
    const track3Samples = allSamplesData.slice(16, 24);
    const track4Samples = allSamplesData.slice(24, 32);
</script>

<section class="p-4 border bg-white">
    <h2 class="text-xl font-semibold mb-4">{$_('sample_table_title')}</h2>
    <!-- Removed: <p class="text-gray-700">{$_('sample_table_description')}</p> -->
    <!-- Placeholder for sample data table -->
    <div class="mt-4 bg-gray-100 p-3">
        <!-- Add Track components here -->
        <div class="mt-4 flex flex-col gap-4">
            <Track trackNumber={1} samples={track1Samples} />
            <Track trackNumber={2} samples={track2Samples} />
            <Track trackNumber={3} samples={track3Samples} />
            <Track trackNumber={4} samples={track4Samples} />
        </div>
    </div>
</section>
