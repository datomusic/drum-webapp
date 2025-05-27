<script lang="ts">
  import SampleButton from './SampleButton.svelte';

  /**
   * The array of sample data (color and MIDI note) for this track.
   */
  export let samples: Array<{ color: string; midiNoteNumber: number }>;
</script>

<div class="flex flex-col items-center p-4">
  <div class="grid grid-cols-4 gap-4 sm:grid-cols-4 md:grid-cols-8">
    {#each samples as sample, i (i)}
      <SampleButton color={sample.color} midiNoteNumber={sample.midiNoteNumber} />
    {/each}
  </div>
</div>
