import { writable } from 'svelte/store';

/**
 * A Svelte store that is true when a file is being dragged over the browser window,
 * and false otherwise. Used to coordinate UI changes like dimming the background.
 */
export const isDraggingOverWindow = writable(false);
