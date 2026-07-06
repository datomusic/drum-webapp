// src/lib/utils/versioning.ts

/**
 * Parses a Dato DRUM firmware version string into its components.
 * Expected format: "major.minor.patch" with an optional "-dev.N" or "-rc.N" suffix
 * Examples: "1.0.0", "1.0.0-dev.10", "1.0.0-rc.1"
 * @param versionString The version string to parse.
 * @returns An object with major, minor, patch as numbers, and an optional suffix (channel + number), or null if parsing fails.
 */
function parseFirmwareVersion(versionString: string): { major: number; minor: number; patch: number; channel?: 'rc' | 'dev'; build?: number } | null {
    // Remove 'v' prefix if present (e.g., "v0.8.3" -> "0.8.3")
    const cleanVersion = versionString.replace(/^v/, '');

    // Regex to match "X.Y.Z", "X.Y.Z-dev.N" or "X.Y.Z-rc.N" where X, Y, Z, N are digits
    const regex = /(\d+)\.(\d+)\.(\d+)(?:-(dev|rc)\.(\d+))?$/;
    const match = cleanVersion.match(regex);

    if (match) {
        const parsed = {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3], 10),
        };
        // Check if the optional -dev.N / -rc.N part was captured
        if (match[4] !== undefined) {
            return { ...parsed, channel: match[4] as 'rc' | 'dev', build: parseInt(match[5], 10) };
        }
        return parsed;
    }
    return null;
}

/**
 * Checks whether a device firmware version predates v1.0.0.
 * Pre-v1.0.0 devices lack the MIDI SysEx firmware upgrade mechanism and must
 * be updated via the RP2350 UF2 downloader (BOOTSEL) mode.
 * @param versionString The device firmware version, or null if not (yet) known.
 * @returns True only when the version is known and its major version is 0.
 */
export function isPreV1Firmware(versionString: string | null): boolean {
    if (!versionString) return false;
    const parsed = parseFirmwareVersion(versionString);
    if (!parsed) return false;
    return parsed.major < 1;
}

// Ordering of suffix channels when major.minor.patch are identical:
// rc.N is a pre-release (older than the plain release), while dev.N counts
// commits past the release (newer than the plain release, existing convention).
const CHANNEL_RANK: Record<string, number> = { rc: 0, dev: 2 };
const RELEASE_RANK = 1;

/**
 * Compares two Dato DRUM firmware version strings to determine if the `newVersion` is newer than the `currentVersion`.
 * Handles "major.minor.patch" and "major.minor.patch-dev.N" / "-rc.N" formats.
 * With identical major.minor.patch: rc.N < release < dev.N, and same-channel
 * suffixes compare by their number.
 * @param currentVersion The current firmware version string (e.g., from the device). Can be null if unknown.
 * @param newVersion The new firmware version string (e.g., the latest available).
 * @returns True if `newVersion` is strictly newer than `currentVersion`, false otherwise.
 */
export function isNewerVersion(currentVersion: string | null, newVersion: string): boolean {
    if (!currentVersion) {
        // If the current version is unknown (e.g., device didn't reply yet),
        // we assume an update is "available" if a newVersion is specified.
        // This prompts the user to update or ensures they have the latest.
        return true;
    }

    const parsedCurrent = parseFirmwareVersion(currentVersion);
    const parsedNew = parseFirmwareVersion(newVersion);

    if (!parsedCurrent || !parsedNew) {
        console.warn(`Failed to parse one or both firmware versions for comparison: current="${currentVersion}", new="${newVersion}"`);
        // If parsing fails, we can't reliably compare, so default to false (no update detected)
        return false;
    }

    // Compare major version
    if (parsedNew.major > parsedCurrent.major) return true;
    if (parsedNew.major < parsedCurrent.major) return false;

    // Compare minor version
    if (parsedNew.minor > parsedCurrent.minor) return true;
    if (parsedNew.minor < parsedCurrent.minor) return false;

    // Compare patch version
    if (parsedNew.patch > parsedCurrent.patch) return true;
    if (parsedNew.patch < parsedCurrent.patch) return false;

    // If major.minor.patch are identical, compare the suffix channels
    const newRank = parsedNew.channel ? CHANNEL_RANK[parsedNew.channel] : RELEASE_RANK;
    const currentRank = parsedCurrent.channel ? CHANNEL_RANK[parsedCurrent.channel] : RELEASE_RANK;
    if (newRank > currentRank) return true; // e.g., 1.0.0 is newer than 1.0.0-rc.1
    if (newRank < currentRank) return false; // e.g., 1.0.0-rc.1 is NOT newer than 1.0.0

    // Same channel: compare the suffix numbers
    if (parsedNew.build !== undefined && parsedCurrent.build !== undefined) {
        if (parsedNew.build > parsedCurrent.build) return true;
        if (parsedNew.build < parsedCurrent.build) return false;
    }

    // Versions are identical or newVersion is older/same
    return false;
}
