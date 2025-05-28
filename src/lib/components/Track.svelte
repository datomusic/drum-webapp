<script lang="ts">
  import { flip } from 'svelte/animate';
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

  // Initialize selectedSampleIndex to the middle sample.
  let selectedSampleIndex = Math.floor(samples.length / 2);

  // Reactive declaration for the color of the Voice component.
  $: selectedVoiceColor = samples[selectedSampleIndex]?.color;

  // Define the sequence of voice icons
  const voiceIcons = [
    '/pad_hat.svg',
    '/pad_snare.svg',
    '/pad_clap.svg',
    '/pad_kick.svg',
  ];

  // Determine the icon for this specific track's Voice component based on its index
  $: currentTrackIcon = voiceIcons[trackIndex % voiceIcons.length];

  // Handler for the custom 'select' event from SampleButton.
  // Updates selectedSampleIndex based on the midiNoteNumber of the clicked button.
  function handleSampleSelect(event: CustomEvent<{ midiNoteNumber: number; color: string }>) {
    const clickedSampleIndex = samples.findIndex(
      sample => sample.midiNoteNumber === event.detail.midiNoteNumber
    );
    if (clickedSampleIndex !== -1) {
      selectedSampleIndex = clickedSampleIndex;
    }
  }
</script>

<div class="flex items-center justify-center w-full gap-x-3 p-1 sm:gap-x-4 sm:p-2">
  {#each samples as sample, i (sample.midiNoteNumber)}
    <div class="animated-item-wrapper" animate:flip={{ duration: 250 }}>
      {#if i === selectedSampleIndex}
        <div class="voice-container flex-shrink-0">
          {#if samples[selectedSampleIndex]} <!-- Ensure selected sample data exists -->
            <Voice color={selectedVoiceColor} imageSrc={currentTrackIcon} />
          {/if}
        </div>
      {:else}
        <SampleButton
          color={sample.color}
          midiNoteNumber={sample.midiNoteNumber}
          on:select={handleSampleSelect}
        />
      {/if}
    </div>
  {/each}
</div>
