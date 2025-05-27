<script lang="ts">
  import SampleButton from './SampleButton.svelte';

  /**
   * The track number to display.
   */
  export let trackNumber: number;

  // Placeholder data for 8 sample buttons within this track.
  // In a real application, this would likely come from a prop or a store.
  const sampleButtonsData = [
    { color: '#FF0000', midiNoteNumber: 36 }, // C1
    { color: '#FFA500', midiNoteNumber: 37 }, // C#1
    { color: '#FFFF00', midiNoteNumber: 38 }, // D1
    { color: '#008000', midiNoteNumber: 39 }, // D#1
    { color: '#0000FF', midiNoteNumber: 40 }, // E1
    { color: '#4B0082', midiNoteNumber: 41 }, // F1
    { color: '#EE82EE', midiNoteNumber: 42 }, // F#1
    { color: '#808080', midiNoteNumber: 43 }, // G1
  ];
</script>

<div class="flex flex-col items-center p-4 bg-gray-800  shadow-lg">
  <h3 class="text-white text-xl font-semibold mb-4">Track {trackNumber}</h3>
  <div class="grid grid-cols-4 gap-4 sm:grid-cols-4 md:grid-cols-8">
    {#each sampleButtonsData as sample, i (i)}
      <SampleButton color={sample.color} midiNoteNumber={sample.midiNoteNumber} />
    {/each}
  </div>
</div>
