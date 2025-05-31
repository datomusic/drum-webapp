/**
 * Example measured values (replace with your measurements)
 * These represent the base grey color of the button when off, and the attenuation
 * factors for each RGB channel due to the silicone material.
 */
const BASE_COLOR_RGB = [20, 20, 20]; // Grey when off (R, G, B)
const ATTENUATION_FACTORS = [.9, .9, .9]; // RGB attenuation factors (customize per your measurements)

/**
 * Converts an RGB array [R, G, B] to a hex color string (e.g., "#RRGGBB").
 * @param rgb An array [R, G, B].
 * @returns A hex color string.
 */
export function rgbToHex(rgb: [number, number, number]): string {
    // Ensure values are clamped between 0 and 255 before conversion
    const clampedRgb = rgb.map(c => Math.max(0, Math.min(255, Math.round(c)))) as [number, number, number];
    return "#" + ((1 << 24) + (clampedRgb[0] << 16) + (clampedRgb[1] << 8) + clampedRgb[2]).toString(16).slice(1).toUpperCase();
}

/**
 * Simulates the observed color of an LED-illuminated silicone button.
 * It mixes a base grey color with the LED color, attenuated by silicone.
 * @param ledColorRgb The LED color as an RGB array [R, G, B].
 * @returns The simulated observed color as an RGB array [R, G, B].
 */
export function simulateButtonColor(ledColorRgb: [number, number, number]): [number, number, number] {
    const [r, g, b] = ledColorRgb;

    // Calculate observed color by blending the base color with the attenuated LED color
    const observed: [number, number, number] = [
        BASE_COLOR_RGB[0] + (r) * ATTENUATION_FACTORS[0],
        BASE_COLOR_RGB[1] + (g) * ATTENUATION_FACTORS[1],
        BASE_COLOR_RGB[2] + (b) * ATTENUATION_FACTORS[2]
    ];

    // Ensure values are clamped between 0 and 255 and rounded to integers
    return observed.map(c => Math.max(0, Math.min(255, Math.round(c)))) as [number, number, number];
}
