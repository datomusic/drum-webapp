<script lang="ts">
    import { _ } from 'svelte-i18n';
    import Track from './Track.svelte'; // Import the Track component

    // Define specific color palettes for each track
    const yellowHues = [
        '#FFD700', '#FFC107', '#FFA000', '#FFB300', '#FFCA28', '#FFD54F', '#FFE082', '#FFECB3'
    ];
    const greenHues = [
        '#4CAF50', '#66BB6A', '#81C784', '#9CCC65', '#AED581', '#C5E1A5', '#DCE775', '#E6EE9C'
    ];
    const blueHues = [
        '#2196F3', '#42A5F5', '#64B5F6', '#90CAF9', '#BBDEFB', '#E3F2FD', '#B3E5FC', '#81D4FA'
    ];
    const redHues = [
        '#F44336', '#E57373', '#EF5350', '#EF9A9A', '#FFCDD2', '#FFEBEE', '#FF8A80', '#FF5252'
    ];

    /**
     * Generates an array of sample data for a track with specific MIDI note range and colors.
     * Notes are generated from high to low.
     * @param startNote The highest MIDI note number for the track.
     * @param endNote The lowest MIDI note number for the track.
     * @param colors An array of hex color strings to cycle through.
     * @returns An array of sample objects { color: string, midiNoteNumber: number }.
     */
    function generateTrackSamples(startNote: number, endNote: number, colors: string[]) {
        const samples = [];
        let colorIndex = 0;
        for (let i = startNote; i >= endNote; i--) {
            samples.push({
                color: colors[colorIndex % colors.length],
                midiNoteNumber: i,
            });
            colorIndex++;
        }
        return samples;
    }

    // Generate samples for each track with their respective color palettes and MIDI note ranges
    const track1Samples = generateTrackSamples(31, 24, yellowHues);
    const track2Samples = generateTrackSamples(23, 16, greenHues);
    const track3Samples = generateTrackSamples(15, 8, blueHues);
    const track4Samples = generateTrackSamples(7, 0, redHues);
</script>

<section class="p-4 border bg-white">
    <h2 class="text-xl font-semibold mb-4">{$_('sample_table_title')}</h2>
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
