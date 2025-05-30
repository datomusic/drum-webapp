<script lang="ts">
  import { midiStore, activeMidiNote } from '$lib/stores/midi'; // Import activeMidiNote
  import { get } from 'svelte/store';

  /**
   * The color of the button, e.g., '#FF0000' or 'red'.
   */
  export let color: string;

  /**
   * The MIDI note number to display on the button.
   */
  export let midiNoteNumber: number;

  // Reactive variable to determine if this button is currently active
  $: isActive = $activeMidiNote === midiNoteNumber;

  function handleClick() {
    // Call the centralized playNote function from the midiStore
    midiStore.playNote(midiNoteNumber);
  }
</script>

<button
  class="
    w-16 h-16
    rounded-full
    text-white text-lg
    cursor-pointer
    transition-all duration-150 ease-in-out
    focus:outline-none
  "
  style="background-color: {color};"
  on:click={handleClick}
  on:keydown
>
  {midiNoteNumber}
</button>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
  /* The background-color is set via the style attribute directly. */
  /* The 'ring' and 'shadow' classes are applied conditionally by Tailwind. */
</style>
