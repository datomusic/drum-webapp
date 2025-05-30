<script lang="ts">
    import { _ } from 'svelte-i18n';
    import Track from './Track.svelte'; // Import the Track component
    import { hexToRgb, rgbToHex, simulateButtonColor } from '$lib/utils/colors'; // Import color utilities

    // Define specific color palettes for each track (these are the *raw LED* colors)
    const track1LedColors = [
        '#FFFF00', '#FFE100', '#FFC300', '#FFA500', '#FFFF20', '#FFE120', '#FFC320', '#FFA520'
    ];
    const track2LedColors = [
        '#00FF00', '#00FF1E', '#00FF3C', '#00FF5A', '#10FF10', '#10FF1E', '#10FF3C', '#20FF5A',
    ];
    const track3LedColors = [
        '#0000FF', '#0028FF', '#0050FF', '#0078FF', '#1010FF', '#1028FF', '#2050FF', '#3078FF',
    ];
    const track4LedColors = [
        '#FF0000', '#FF0020', '#FF0040', '#FF0060', '#FF1010', '#FF1020', '#FF2040', '#FF2060',
    ];

    /**
     * Generates an array of sample data for a track with specific MIDI note range and colors.
     * The order of notes (ascending or descending) is determined by the start and end notes.
     * @param startNote The first MIDI note number for the track.
     * @param endNote The last MIDI note number for the track.
     * @param ledColors An array of hex color strings representing the LED colors.
     * @returns An array of sample objects { color: string, midiNoteNumber: number }.
     */
    function generateTrackSamples(startNote: number, endNote: number, ledColors: string[]) {
        const samples = [];
        let colorIndex = 0;

        // Determine the direction of iteration
        const step = startNote <= endNote ? 1 : -1;
        const condition = (i: number) => (startNote <= endNote ? i <= endNote : i >= endNote);

        for (let i = startNote; condition(i); i += step) {
            const ledHexColor = ledColors[colorIndex % ledColors.length];
            const ledRgbColor = hexToRgb(ledHexColor);

            if (ledRgbColor) {
                // Simulate the button color based on LED color and physical properties
                const simulatedRgbColor = simulateButtonColor(ledRgbColor);
                const simulatedHexColor = rgbToHex(simulatedRgbColor);

                samples.push({
                    color: simulatedHexColor, // Use the simulated color for the UI
                    midiNoteNumber: i,
                });
            } else {
                console.warn(`Invalid hex color: ${ledHexColor}. Using default fallback.`);
                samples.push({
                    color: '#808080', // Fallback to a neutral grey if hex conversion fails
                    midiNoteNumber: i,
                });
            }
            colorIndex++;
        }
        return samples;
    }

    // Generate samples for each track with their respective color palettes and MIDI note ranges
    const track1Samples = generateTrackSamples(24, 31, track1LedColors);
    const track2Samples = generateTrackSamples(16, 23, track2LedColors);
    const track3Samples = generateTrackSamples(8, 15, track3LedColors);
    const track4Samples = generateTrackSamples(0, 7, track4LedColors);

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
