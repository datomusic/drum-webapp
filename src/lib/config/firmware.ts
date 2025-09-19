// src/lib/config/firmware.ts

/**
 * The latest available firmware version for the Dato DRUM.
 * This should match the version string format (e.g., "1.0.0-dev.10").
 * Update this value when a new firmware is released.
 */
export const LATEST_FIRMWARE_VERSION = "v0.8.3";

/**
 * The URL to download the latest firmware (.uf2) file.
 * This should point to a static file hosted alongside the web app.
 * For example, if placed in the `static` directory, it would be `/firmware/dato_drum_v1.0.0-dev.10.uf2`.
 * Ensure the file exists at this path.
 */
export const FIRMWARE_DOWNLOAD_URL = "https://github.com/datomusic/drum-firmware/releases/download/v0.8.3/drum-0.8.3.uf2";
