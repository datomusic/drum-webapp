// src/lib/config/firmware.ts

import { getLatestFirmwareInfo } from '../services/githubReleaseService.js';

/**
 * The latest available firmware version for the Dato DRUM.
 * This should match the version string format (e.g., "v0.9.0").
 * Used as a fallback when GitHub API is unavailable.
 */
export const FALLBACK_FIRMWARE_VERSION = "v0.9.0";

/**
 * The fallback URL to download the firmware (.uf2) file.
 * Used when GitHub API is unavailable.
 */
export const FALLBACK_FIRMWARE_DOWNLOAD_URL = "https://github.com/datomusic/drum-firmware/releases/download/v0.9.0/drum-0.9.0.uf2";

/**
 * Gets the latest firmware version and download URL.
 * First attempts to fetch from GitHub API, falls back to static values if unavailable.
 */
export async function getLatestFirmware(): Promise<{
	version: string;
	downloadUrl: string;
	size?: number;
}> {
	// Try to get latest from GitHub first
	const latestInfo = await getLatestFirmwareInfo();

	if (latestInfo) {
		return {
			version: latestInfo.version,
			downloadUrl: latestInfo.downloadUrl,
			size: latestInfo.size
		};
	}

	// Fall back to static configuration
	return {
		version: FALLBACK_FIRMWARE_VERSION,
		downloadUrl: FALLBACK_FIRMWARE_DOWNLOAD_URL
	};
}

/**
 * Gets the latest firmware version synchronously.
 * Returns the fallback version - use getLatestFirmware() for dynamic updates.
 */
export function getCurrentFirmwareVersion(): string {
	return FALLBACK_FIRMWARE_VERSION;
}
