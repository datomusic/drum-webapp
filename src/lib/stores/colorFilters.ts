import { writable } from 'svelte/store';

/**
 * Defines the state for color filter adjustments.
 * Values are multipliers, where 1 means 100% (no change).
 */
interface ColorFilterState {
    saturation: number; // e.g., 1 (100%), 0.5 (50%), 2 (200%)
    brightness: number; // e.g., 1 (100%), 0.8 (80%), 1.2 (120%)
    contrast: number;   // e.g., 1 (100%), 0.8 (80%), 1.2 (120%)
}

/**
 * A Svelte store to manage global color filter settings for UI elements.
 * These filters are applied via CSS to visually transform colors.
 */
export const colorFilters = writable<ColorFilterState>({
    saturation: 1, // Default: 100% saturation
    brightness: 1, // Default: 100% brightness
    contrast: 1,   // Default: 100% contrast
});
