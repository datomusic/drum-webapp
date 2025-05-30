<script lang="ts">
    import { _ } from 'svelte-i18n';
    import Track from './Track.svelte'; // Import the Track component
    import { rgbToHex, simulateButtonColor } from '$lib/utils/colors'; // Update import: removed hexToRgb

    // Define specific color palettes for each track as RGB arrays (raw LED colors)
    const track1LedColors: [number, number, number][] = [
        [255, 255, 0], [255, 225, 0], [255, 195, 0], [255, 165, 0], [255, 255, 32], [255, 225, 32], [255, 195, 32], [255, 165, 32]
    ];
    const track2LedColors: [number, number, number][] = [
        [0, 255, 0], [0, 255, 30], [0, 255, 60], [0, 255, 90], [16, 255, 16], [16, 255, 30], [16, 255, 60], [32, 255, 90],
    ];
    const track3LedColors: [number, number, number][] = [
        [0, 0, 255], [0, 40, 255], [0, 80, 255], [0, 120, 255], [16, 16, 255], [16, 40, 255], [32, 80, 255], [48, 120, 255],
    ];
    const track4LedColors: [number, number, number][] = [
        [255, 0, 0], [255, 0, 32], [255, 0, 64], [255, 0, 96], [255, 16, 16], [255, 16, 32], [255, 32, 64], [255, 32, 96],
    ];

    /**
     * Generates an array of sample data for a track with specific MIDI note range and colors.
     * The order of notes (ascending or descending) is determined by the start and end notes.
     * @param startNote The first MIDI note number for the track.
     * @param endNote The last MIDI note number for the track.
     * @param ledColors An array of RGB color arrays representing the LED colors.
     * @returns An array of sample objects { color: string, midiNoteNumber: number }.
     */
    function generateTrackSamples(startNote: number, endNote: number, ledColors: [number, number, number][]) {
        const samples = [];
        let colorIndex = 0;

        // Determine the direction of iteration
        const step = startNote <= endNote ? 1 : -1;
        const condition = (i: number) => (startNote <= endNote ? i <= endNote : i >= endNote);

        for (let i = startNote; condition(i); i += step) {
            const ledRgbColor = ledColors[colorIndex % ledColors.length];
            
            // Simulate the button color based on LED color and physical properties
            const simulatedRgbColor = simulateButtonColor(ledRgbColor);
            const simulatedHexColor = rgbToHex(simulatedRgbColor);

            samples.push({
                color: simulatedHexColor, // Use the simulated color for the UI
                midiNoteNumber: i,
            });
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
