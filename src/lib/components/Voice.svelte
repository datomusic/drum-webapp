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
    w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-18 lg:h-18 xl:w-20 xl:h-20
    rounded-lg
    flex items-center justify-center
    shadow-sm
    hover:shadow-md
    transition-all duration-150 ease-in-out
    cursor-pointer
"
style="{backgroundStyle}"
>
  <img src="/pad_hat.svg" alt="Voice Settings" class="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" />
</div>

<style>
  /* No specific styles needed here, Tailwind handles most of it. */
</style>
