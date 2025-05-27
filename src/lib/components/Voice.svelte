<script lang="ts">
  // This component represents the "Voice" settings for a sample slot.
  // It displays an icon indicating its purpose.

  /**
   * Optional color to apply to the voice component's background.
   * If undefined, a default gray background will be used.
   */
  export let color: string | undefined = undefined;

  // Reactive statement to determine the background style
  $: backgroundStyle = color ? `background-color: ${color};` : 'background-color: #e5e7eb;'; // Tailwind's bg-gray-200
</script>

<div class="
    voice-component
    w-12 h-12 sm:w-14 sm:h-14 md:w-32 md:h-32
    rounded-lg
    flex items-center justify-center
    shadow-sm
    hover:shadow-md
    transition-all duration-150 ease-in-out
    cursor-pointer
"
style="{backgroundStyle}"
>
  <img src="/pad_hat.svg" alt="Voice Settings" class="w-8 h-8 sm:w-10 sm:h-10 md:w-26 md:h-26" />
</div>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
</style>
