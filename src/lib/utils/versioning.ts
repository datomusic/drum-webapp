// src/lib/utils/versioning.ts

/**
 * Parses a Dato DRUM firmware version string into its components.
 * Expected format: "major.minor.patch-dev.commits"
 * Example: "1.0.0-dev.10"
 * @param versionString The version string to parse.
 * @returns An object with major, minor, patch, and commits as numbers, or null if parsing fails.
 */
function parseFirmwareVersion(versionString: string): { major: number; minor: number; patch: number; commits: number } | null {
    // Regex to match "X.Y.Z-dev.C" where X, Y, Z, C are digits
    const regex = /(\d+)\.(\d+)\.(\d+)-dev\.(\d+)/;
    const match = versionString.match(regex);

    if (match) {
        return {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3], 10),
            commits: parseInt(match[4], 10),
        };
    }
    return null;
}

/**
 * Compares two Dato DRUM firmware version strings to determine if the `newVersion` is newer than the `currentVersion`.
 * Handles the "major.minor.patch-dev.commits" format.
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

    // Compare commits (for -dev versions)
    if (parsedNew.commits > parsedCurrent.commits) return true;
    if (parsedNew.commits < parsedCurrent.commits) return false;

    // Versions are identical or newVersion is older/same
    return false;
}
