<script lang="ts">
    import { _ } from 'svelte-i18n';
    import Track from './Track.svelte';
    import { rgbToHex, simulateButtonColor } from '$lib/utils/colors';

    // Define specific sample data for each track, including MIDI note and raw LED color
    // This structure allows for non-consecutive MIDI notes and tightly couples them with colors.
    const track4SampleData: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[] = [
        { midiNoteNumber: 54, ledColorRgb: [255, 255, 0] },
        { midiNoteNumber: 55, ledColorRgb: [255, 225, 0] },
        { midiNoteNumber: 56, ledColorRgb: [255, 195, 0] },
        { midiNoteNumber: 57, ledColorRgb: [255, 165, 0] },
        { midiNoteNumber: 58, ledColorRgb: [255, 255, 32] },
        { midiNoteNumber: 59, ledColorRgb: [255, 225, 32] },
        { midiNoteNumber: 60, ledColorRgb: [255, 195, 32] },
        { midiNoteNumber: 61, ledColorRgb: [255, 165, 32] }
    ];

    const track3SampleData: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[] = [
        { midiNoteNumber: 46, ledColorRgb: [0, 255, 0] },
        { midiNoteNumber: 47, ledColorRgb: [0, 255, 30] },
        { midiNoteNumber: 48, ledColorRgb: [0, 255, 60] },
        { midiNoteNumber: 49, ledColorRgb: [0, 255, 90] },
        { midiNoteNumber: 50, ledColorRgb: [16, 255, 16] },
        { midiNoteNumber: 51, ledColorRgb: [16, 255, 30] },
        { midiNoteNumber: 52, ledColorRgb: [16, 255, 60] },
        { midiNoteNumber: 53, ledColorRgb: [32, 255, 90] }
    ];

    const track2SampleData: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[] = [
        { midiNoteNumber: 38, ledColorRgb: [0, 0, 255] },
        { midiNoteNumber: 39, ledColorRgb: [0, 40, 255] },
        { midiNoteNumber: 40, ledColorRgb: [0, 80, 255] },
        { midiNoteNumber: 41, ledColorRgb: [0, 120, 255] },
        { midiNoteNumber: 42, ledColorRgb: [16, 16, 255] },
        { midiNoteNumber: 43, ledColorRgb: [16, 40, 255] },
        { midiNoteNumber: 44, ledColorRgb: [32, 80, 255] },
        { midiNoteNumber: 45, ledColorRgb: [48, 120, 255] }
    ];

    const track1SampleData: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[] = [
        { midiNoteNumber: 30, ledColorRgb: [255, 0, 0] },
        { midiNoteNumber: 31, ledColorRgb: [255, 0, 32] },
        { midiNoteNumber: 32, ledColorRgb: [255, 0, 64] },
        { midiNoteNumber: 33, ledColorRgb: [255, 0, 96] },
        { midiNoteNumber: 34, ledColorRgb: [255, 16, 16] },
        { midiNoteNumber: 35, ledColorRgb: [255, 16, 32] },
        { midiNoteNumber: 36, ledColorRgb: [255, 32, 64] },
        { midiNoteNumber: 37, ledColorRgb: [255, 32, 96] }
    ];

    /**
     * Processes raw sample data (MIDI note and LED color) into displayable sample objects
     * with simulated button colors.
     * @param data An array of objects, each containing a midiNoteNumber and its raw ledColorRgb.
     * @returns An array of sample objects { color: string, midiNoteNumber: number }.
     */
    function processSampleData(data: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[]) {
        return data.map(item => {
            // Simulate the button color based on LED color and physical properties
            const simulatedRgbColor = simulateButtonColor(item.ledColorRgb);
            const simulatedHexColor = rgbToHex(simulatedRgbColor);

            return {
                color: simulatedHexColor, // Use the simulated color for the UI
                midiNoteNumber: item.midiNoteNumber,
            };
        });
    }

    // Generate samples for each track using the new data structure
    const track1Samples = processSampleData(track1SampleData);
    const track2Samples = processSampleData(track2SampleData);
    const track3Samples = processSampleData(track3SampleData);
    const track4Samples = processSampleData(track4SampleData);

    // Group tracks with their samples for easier iteration
    const tracks = [
        { samples: track1Samples },
        { samples: track2Samples },
        { samples: track3Samples },
        { samples: track4Samples },
    ];
</script>

<section class="w-full bg-white h-full">
    <div class="mx-auto px-4 h-full grid grid-rows-4">
        {#each tracks as track, i (i)}
            <Track samples={track.samples} trackIndex={i} />
        {/each}
    </div>
</section>
