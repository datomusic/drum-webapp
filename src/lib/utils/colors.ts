/**
 * Example measured values (replace with your measurements)
 * These represent the base grey color of the button when off, and the attenuation
 * factors for each RGB channel due to the silicone material.
 */
const BASE_COLOR_RGB = [120, 120, 120]; // Grey when off (R, G, B)
const ATTENUATION_FACTORS = [1, 1, 1]; // RGB attenuation factors (customize per your measurements)

/**
 * Converts a hex color string (e.g., "#RRGGBB") to an RGB array.
 * @param hex The hex color string.
 * @returns An array [R, G, B] or null if invalid.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : null;
}

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
        BASE_COLOR_RGB[0] + (r - BASE_COLOR_RGB[0]) * ATTENUATION_FACTORS[0],
        BASE_COLOR_RGB[1] + (g - BASE_COLOR_RGB[1]) * ATTENUATION_FACTORS[1],
        BASE_COLOR_RGB[2] + (b - BASE_COLOR_RGB[2]) * ATTENUATION_FACTORS[2]
    ];

    // Ensure values are clamped between 0 and 255 and rounded to integers
    return observed.map(c => Math.max(0, Math.min(255, Math.round(c)))) as [number, number, number];
}
