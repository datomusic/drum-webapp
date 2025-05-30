<script lang="ts">
    import { _ } from 'svelte-i18n';
    import Track from './Track.svelte'; // Import the Track component

    // Define specific color palettes for each track
    const track1Colors = [
        '#FFFF00', '#FFE100', '#FFC300', '#FFA500', '#FFFF20', '#FFE120', '#FFC320', '#FFA520'
    ];
    const track2Colors = [
        '#00FF00', '#00FF1E', '#00FF3C', '#00FF5A', '#10FF10', '#10FF1E', '#10FF3C', '#20FF5A',
    ];
    const track3Colors = [
        '#0000FF', '#0028FF', '#0050FF', '#0078FF', '#1010FF', '#1028FF', '#2050FF', '#3078FF',
    ];
    const track4Colors = [
        '#FF0000', '#FF0020', '#FF0040', '#FF0060', '#FF1010', '#FF1020', '#FF2040', '#FF2060',
    ];

    /**
     * Generates an array of sample data for a track with specific MIDI note range and colors.
     * The order of notes (ascending or descending) is determined by the start and end notes.
     * @param startNote The first MIDI note number for the track.
     * @param endNote The last MIDI note number for the track.
     * @param colors An array of hex color strings to cycle through.
     * @returns An array of sample objects { color: string, midiNoteNumber: number }.
     */
    function generateTrackSamples(startNote: number, endNote: number, colors: string[]) {
        const samples = [];
        let colorIndex = 0;

        if (startNote <= endNote) {
            // Loop in increasing order if startNote is less than or equal to endNote
            for (let i = startNote; i <= endNote; i++) {
                samples.push({
                    color: colors[colorIndex % colors.length],
                    midiNoteNumber: i,
                });
                colorIndex++;
            }
        } else {
            // Loop in decreasing order if startNote is greater than endNote
            for (let i = startNote; i >= endNote; i--) {
                samples.push({
                    color: colors[colorIndex % colors.length],
                    midiNoteNumber: i,
                });
                colorIndex++;
            }
        }
        return samples;
    }

    // Generate samples for each track with their respective color palettes and MIDI note ranges
    const track1Samples = generateTrackSamples(24, 31, track1Colors);
    const track2Samples = generateTrackSamples(16, 23, track2Colors);
    const track3Samples = generateTrackSamples(8, 15, track3Colors);
    const track4Samples = generateTrackSamples(0, 7, track4Colors);

    // Group tracks with their samples for easier iteration
    const tracks = [
        { samples: track1Samples },
        { samples: track2Samples },
        { samples: track3Samples },
        { samples: track4Samples },
    ];
</script>

<section class="w-full bg-white py-4">
    <div class="mx-auto px-4">
        {#each tracks as track, i (i)}
            <Track samples={track.samples} trackIndex={i} />
        {/each}
    </div>
</section>
