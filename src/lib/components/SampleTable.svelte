<script lang="ts">
    import { _ } from 'svelte-i18n';
    import Track from './Track.svelte';
    import { rgbToHex, simulateButtonColor } from '$lib/utils/colors';

    // Define specific sample data for each track, including MIDI note and raw LED color
    // This structure allows for non-consecutive MIDI notes and tightly couples them with colors.
    const track1SampleData: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[] = [
        { midiNoteNumber: 42, ledColorRgb: [255, 255, 0] }, // C2
        { midiNoteNumber: 44, ledColorRgb: [255, 225, 0] }, // C#2
        { midiNoteNumber: 46, ledColorRgb: [255, 195, 0] }, // D2
        { midiNoteNumber: 49, ledColorRgb: [255, 165, 0] }, // D#2
        { midiNoteNumber: 51, ledColorRgb: [255, 255, 32] }, // E2
        { midiNoteNumber: 52, ledColorRgb: [255, 225, 32] }, // F2
        { midiNoteNumber: 53, ledColorRgb: [255, 195, 32] }, // F#2
        { midiNoteNumber: 57, ledColorRgb: [255, 165, 32] }  // G2
    ];

    const track2SampleData: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[] = [
        { midiNoteNumber: 45, ledColorRgb: [0, 255, 0] },   // C1
        { midiNoteNumber: 58, ledColorRgb: [0, 255, 30] },  // C#1
        { midiNoteNumber: 59, ledColorRgb: [0, 255, 60] },  // D1
        { midiNoteNumber: 60, ledColorRgb: [0, 255, 90] },  // D#1
        { midiNoteNumber: 61, ledColorRgb: [16, 255, 16] }, // E1
        { midiNoteNumber: 62, ledColorRgb: [16, 255, 30] }, // F1
        { midiNoteNumber: 63, ledColorRgb: [16, 255, 60] }, // F#1
        { midiNoteNumber: 64, ledColorRgb: [32, 255, 90] }, // G1
    ];

    const track3SampleData: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[] = [
        { midiNoteNumber: 38, ledColorRgb: [0, 0, 255] },    // C0
        { midiNoteNumber: 40, ledColorRgb: [0, 40, 255] },   // C#0
        { midiNoteNumber: 39, ledColorRgb: [0, 80, 255] },  // D0
        { midiNoteNumber: 54, ledColorRgb: [0, 120, 255] }, // D#0
        { midiNoteNumber: 56, ledColorRgb: [16, 16, 255] }, // E0
        { midiNoteNumber: 75, ledColorRgb: [16, 40, 255] }, // F0
        { midiNoteNumber: 76, ledColorRgb: [32, 80, 255] }, // F#0
        { midiNoteNumber: 77, ledColorRgb: [48, 120, 255] },// G0
    ];

    const track4SampleData: { midiNoteNumber: number; ledColorRgb: [number, number, number] }[] = [
        { midiNoteNumber: 35, ledColorRgb: [255, 0, 0] },    // C-1
        { midiNoteNumber: 36, ledColorRgb: [255, 0, 32] },   // C#-1
        { midiNoteNumber: 37, ledColorRgb: [255, 0, 64] },   // D-1
        { midiNoteNumber: 41, ledColorRgb: [255, 0, 96] },   // D#-1
        { midiNoteNumber: 43, ledColorRgb: [255, 16, 16] },  // E-1
        { midiNoteNumber: 47, ledColorRgb: [255, 16, 32] },  // F-1
        { midiNoteNumber: 48, ledColorRgb: [255, 32, 64] },  // F#-1
        { midiNoteNumber: 50, ledColorRgb: [255, 32, 96] },  // G-1
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

<section class="w-full bg-white py-4">
    <div class="mx-auto px-4">
        {#each tracks as track, i (i)}
            <Track samples={track.samples} trackIndex={i} />
        {/each}
    </div>
</section>
