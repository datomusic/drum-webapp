<script lang="ts">
  import SampleButton from './SampleButton.svelte';
  import Voice from './Voice.svelte'; // Import the new Voice component

  /**
   * The array of sample data (color and MIDI note) for this track.
   */
  export let samples: Array<{ color: string; midiNoteNumber: number }>;

  // State to hold the color of the last selected sample button in this track
  let selectedVoiceColor: string | undefined = undefined;

  // Handler for the custom 'select' event from SampleButton
  function handleSampleSelect(event: CustomEvent<{ color: string }>) {
    selectedVoiceColor = event.detail.color;
  }
</script>

<div class="flex flex-col items-center p-4">
  <!-- Pass the selectedVoiceColor to the Voice component -->
  <Voice color={selectedVoiceColor} />
  <div class="grid grid-cols-4 gap-4 sm:grid-cols-4 md:grid-cols-8">
    {#each samples as sample, i (i)}
      <div class="flex flex-col items-center gap-2">
        <SampleButton
          color={sample.color}
          midiNoteNumber={sample.midiNoteNumber}
          on:select={handleSampleSelect}
        />
      </div>
    {/each}
  </div>
</div>
