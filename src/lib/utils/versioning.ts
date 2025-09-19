// src/lib/utils/versioning.ts

/**
 * Parses a Dato DRUM firmware version string into its components.
 * Expected format: "major.minor.patch" or "major.minor.patch-dev.commits"
 * Examples: "1.0.0", "1.0.0-dev.10"
 * @param versionString The version string to parse.
 * @returns An object with major, minor, patch as numbers, and optional commits as a number, or null if parsing fails.
 */
function parseFirmwareVersion(versionString: string): { major: number; minor: number; patch: number; commits?: number } | null {
    // Remove 'v' prefix if present (e.g., "v0.8.3" -> "0.8.3")
    const cleanVersion = versionString.replace(/^v/, '');

    // Regex to match "X.Y.Z" or "X.Y.Z-dev.C" where X, Y, Z, C are digits
    const regex = /(\d+)\.(\d+)\.(\d+)(?:-dev\.(\d+))?$/;
    const match = cleanVersion.match(regex);

    if (match) {
        const parsed = {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3], 10),
        };
        // Check if the optional -dev.commits part was captured
        if (match[4] !== undefined) {
            return { ...parsed, commits: parseInt(match[4], 10) };
        }
        return parsed;
    }
    return null;
}

/**
 * Compares two Dato DRUM firmware version strings to determine if the `newVersion` is newer than the `currentVersion`.
 * Handles "major.minor.patch" and "major.minor.patch-dev.commits" formats.
 * A version with `-dev.commits` is considered newer than one without, if major.minor.patch are identical.
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

    // If major.minor.patch are identical, compare the -dev.commits part
    // A version with commits is considered newer than one without.
    if (parsedNew.commits !== undefined && parsedCurrent.commits === undefined) {
        return true; // e.g., 1.0.0-dev.10 is newer than 1.0.0
    }
    if (parsedNew.commits === undefined && parsedCurrent.commits !== undefined) {
        return false; // e.g., 1.0.0 is NOT newer than 1.0.0-dev.10
    }
    if (parsedNew.commits !== undefined && parsedCurrent.commits !== undefined) {
        // Both have commits, compare them
        if (parsedNew.commits > parsedCurrent.commits) return true;
        if (parsedNew.commits < parsedCurrent.commits) return false;
    }

    // Versions are identical or newVersion is older/same
    return false;
}
