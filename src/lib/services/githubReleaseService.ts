// src/lib/services/githubReleaseService.ts

interface GitHubAsset {
	name: string;
	browser_download_url: string;
	size: number;
}

interface GitHubRelease {
	tag_name: string;
	name: string;
	assets: GitHubAsset[];
}

/**
 * Fetches the latest firmware release from GitHub
 */
export async function fetchLatestFirmwareRelease(): Promise<GitHubRelease> {
	const response = await fetch('https://api.github.com/repos/datomusic/drum-firmware/releases/latest', {
		headers: {
			'Accept': 'application/vnd.github.v3+json',
			'User-Agent': 'drum-webapp'
		}
	});

	if (!response.ok) {
		throw new Error(`GitHub API request failed with status ${response.status}`);
	}

	const release = await response.json() as GitHubRelease;
	return release;
}

/**
 * Finds the firmware UF2 asset from a release
 */
export function findFirmwareAsset(assets: GitHubAsset[]): GitHubAsset | null {
	// Match semver pattern first (e.g., "drum-v0.9.0.uf2" or "drum-0.9.0.uf2")
	const semverPattern = /^drum-v?\d+\.\d+\.\d+\.uf2$/;
	let semverAsset = assets.find(asset => semverPattern.test(asset.name));
	if (semverAsset) {
		return semverAsset;
	}

	// Fall back to any drum UF2 file
	const drumPattern = /^drum.*\.uf2$/;
	let drumAsset = assets.find(asset => drumPattern.test(asset.name));
	if (drumAsset) {
		return drumAsset;
	}

	return null;
}

/**
 * Gets the latest firmware version and download URL from GitHub
 */
export async function getLatestFirmwareInfo(): Promise<{
	version: string;
	downloadUrl: string;
	size: number;
} | null> {
	try {
		const release = await fetchLatestFirmwareRelease();
		const asset = findFirmwareAsset(release.assets);

		if (!asset) {
			console.warn('No firmware assets found in latest release');
			return null;
		}

		return {
			version: release.tag_name,
			downloadUrl: asset.browser_download_url,
			size: asset.size
		};
	} catch (error) {
		console.error('Failed to fetch latest firmware info:', error);
		return null;
	}
}