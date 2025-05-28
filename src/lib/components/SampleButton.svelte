<script lang="ts">
  import { midiStore } from '$lib/stores/midi';
  import { get } from 'svelte/store';
  import { createEventDispatcher } from 'svelte'; // Import createEventDispatcher

  /**
   * The color of the button, e.g., '#FF0000' or 'red'.
   */
  export let color: string;

  /**
   * The MIDI note number to display on the button.
   */
  export let midiNoteNumber: number;

  const NOTE_ON_VELOCITY = 127; // Max velocity
  const NOTE_OFF_VELOCITY = 0; // Velocity for note off (often ignored, but good practice)
  const NOTE_DURATION_MS = 100; // Duration before sending Note Off

  const dispatch = createEventDispatcher(); // Initialize dispatcher

  function playMidiNote() {
    const { selectedOutput } = get(midiStore);

    if (selectedOutput) {
      // MIDI Note On message: [status byte, note number, velocity]
      // Status byte 0x90 = Note On on channel 1
      selectedOutput.send([0x90, midiNoteNumber, NOTE_ON_VELOCITY]);

      // Schedule MIDI Note Off after a delay
      setTimeout(() => {
        // MIDI Note Off message: [status byte, note number, velocity]
        // Status byte 0x80 = Note Off on channel 1
        selectedOutput.send([0x80, midiNoteNumber, NOTE_OFF_VELOCITY]);
      }, NOTE_DURATION_MS);
    } else {
      console.warn('No MIDI output selected. Cannot play note.');
    }

    // Dispatch a custom event with the button's midiNoteNumber and color
    dispatch('select', { midiNoteNumber: midiNoteNumber, color: color });
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
  on:click={playMidiNote}
  on:keydown
>
  {midiNoteNumber}
</button>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
  /* The background-color is set via the style attribute directly. */
</style>
