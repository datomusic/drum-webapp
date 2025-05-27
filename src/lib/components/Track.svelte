<script lang="ts">
  import SampleButton from './SampleButton.svelte';
  import Voice from './Voice.svelte'; // Import the new Voice component

  /**
   * The array of sample data (color and MIDI note) for this track.
   */
  export let samples: Array<{ color: string; midiNoteNumber: number }>;

  /**
   * The index of this track, used to determine the Voice component's icon.
   */
  export let trackIndex: number; // New prop for the track's index

  // State to hold the color of the last selected sample button in this track
  let selectedVoiceColor: string | undefined = undefined;

  // Define the sequence of voice icons
  const voiceIcons = [
    '/pad_hat.svg',
    '/pad_snare.svg',
    '/pad_clap.svg',
    '/pad_kick.svg',
  ];

  // Determine the icon for this specific track's Voice component based on its index
  $: currentTrackIcon = voiceIcons[trackIndex % voiceIcons.length];

  // Handler for the custom 'select' event from SampleButton
  function handleSampleSelect(event: CustomEvent<{ color: string }>) {
    selectedVoiceColor = event.detail.color;
  }
</script>

<div class="flex flex-col items-center p-4">
  <!-- Single Voice component for the track, displaying track-specific icon and selected color -->
  <Voice color={selectedVoiceColor} imageSrc={currentTrackIcon} />

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
