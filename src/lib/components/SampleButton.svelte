<script lang="ts">
  /**
   * The color of the button, e.g., '#FF0000' or 'red'.
   */
  export let color: string;

  /**
   * The MIDI note number to display on the button.
   */
  export let midiNoteNumber: number;
</script>

<button
  class="
    w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 xl:w-32 xl:h-32
    rounded-full
    flex items-center justify-center
    text-white text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl
    font-bold
     hover:shadow-lg active:shadow-inner
    transition-all duration-150 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
  "
  style="background-color: {color};"
  on:click
  on:keydown
>
  {midiNoteNumber}
</button>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
  /* The background-color is set via the style attribute directly. */
</style>
