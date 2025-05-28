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

  // Initialize selectedSampleIndex to the middle sample.
  // For an array of 8 samples, Math.floor(8 / 2) = 4.
  // This means samples at indices 0, 1, 2, 3 are to the left.
  // The sample at index 4 is "selected" (represented by Voice).
  // Samples at indices 5, 6, 7 are to the right.
  let selectedSampleIndex = Math.floor(samples.length / 2);

  // Reactive declaration for the color of the Voice component.
  // It updates whenever selectedSampleIndex or the samples array changes.
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
      // selectedVoiceColor will update reactively due to the '$:' declaration.
    }
  }
</script>

<div class="flex items-center justify-center gap-3 p-1 sm:gap-4 sm:p-2">
  <!-- Render SampleButtons to the left of the Voice component -->
  {#each samples.slice(0, selectedSampleIndex) as sample (sample.midiNoteNumber)}
    <SampleButton
      color={sample.color}
      midiNoteNumber={sample.midiNoteNumber}
      on:select={handleSampleSelect}
    />
  {/each}

  <!-- Voice Component (replaces the selected SampleButton) -->
  <Voice color={selectedVoiceColor} imageSrc={currentTrackIcon} />

  <!-- Render SampleButtons to the right of the Voice component -->
  {#each samples.slice(selectedSampleIndex + 1) as sample (sample.midiNoteNumber)}
    <SampleButton
      color={sample.color}
      midiNoteNumber={sample.midiNoteNumber}
      on:select={handleSampleSelect}
    />
  {/each}
</div>
