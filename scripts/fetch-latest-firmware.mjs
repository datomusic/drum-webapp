#!/usr/bin/env node
// Build-time firmware fetcher.
//
// Downloads the latest DRUM firmware release from GitHub into static/firmware/
// and records it in src/lib/config/firmwareManifest.json. The app serves the
// UF2 same-origin, so the browser can fetch its bytes for the SysEx firmware
// upload (GitHub's release-asset CDN sends no CORS headers).
//
// Runs automatically as the `prebuild` step. If GitHub is unreachable but a
// previously fetched firmware is already present, the build continues with a
// warning; it only fails when there is no firmware to bundle at all.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const firmwareDir = join(projectRoot, 'static', 'firmware');
const manifestPath = join(projectRoot, 'src', 'lib', 'config', 'firmwareManifest.json');

const RELEASES_URL = 'https://api.github.com/repos/datomusic/drum-firmware/releases?per_page=10';

// Match semver-named assets first, including prerelease suffixes
// (e.g., "drum-v0.9.0.uf2", "drum-1.0.0-rc.1.uf2"), then any drum UF2.
const SEMVER_ASSET_PATTERN = /^drum-v?\d+\.\d+\.\d+(?:-(?:rc|dev)\.\d+)?\.uf2$/;
const DRUM_ASSET_PATTERN = /^drum.*\.uf2$/;

function findFirmwareAsset(assets) {
	return assets.find((a) => SEMVER_ASSET_PATTERN.test(a.name)) ?? assets.find((a) => DRUM_ASSET_PATTERN.test(a.name)) ?? null;
}

function readExistingManifest() {
	if (!existsSync(manifestPath)) return null;
	try {
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		if (manifest.file && existsSync(join(firmwareDir, manifest.file))) {
			return manifest;
		}
	} catch {
		// Corrupt manifest counts as absent
	}
	return null;
}

async function main() {
	let release, asset;
	try {
		const response = await fetch(RELEASES_URL, {
			headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'drum-webapp-build' }
		});
		if (!response.ok) {
			throw new Error(`GitHub API request failed with status ${response.status}`);
		}
		const releases = await response.json();
		// Newest non-draft release that actually carries a firmware asset;
		// includes prereleases, which /releases/latest would skip.
		release = releases.find((r) => !r.draft && findFirmwareAsset(r.assets));
		if (!release) {
			throw new Error('No release with a firmware asset found');
		}
		asset = findFirmwareAsset(release.assets);
	} catch (error) {
		const existing = readExistingManifest();
		if (existing) {
			console.warn(`[fetch-firmware] WARNING: ${error.message}`);
			console.warn(`[fetch-firmware] Using previously fetched firmware ${existing.version} (${existing.file})`);
			return;
		}
		throw error;
	}

	const existing = readExistingManifest();
	if (existing && existing.version === release.tag_name && existing.size === asset.size) {
		console.log(`[fetch-firmware] Firmware ${existing.version} already bundled, skipping download`);
		return;
	}

	console.log(`[fetch-firmware] Downloading ${asset.name} (${release.tag_name}, ${asset.size} bytes)...`);
	const download = await fetch(asset.browser_download_url, {
		headers: { 'User-Agent': 'drum-webapp-build' }
	});
	if (!download.ok) {
		throw new Error(`Firmware download failed with status ${download.status}`);
	}
	const data = Buffer.from(await download.arrayBuffer());
	if (data.length !== asset.size) {
		throw new Error(`Download size mismatch: expected ${asset.size} bytes, got ${data.length}`);
	}

	mkdirSync(firmwareDir, { recursive: true });
	// Remove previously fetched versions (drum-*.uf2) so stale firmware
	// doesn't accumulate; leaves other files in static/firmware alone.
	for (const file of readdirSync(firmwareDir)) {
		if (DRUM_ASSET_PATTERN.test(file) && file !== asset.name) {
			unlinkSync(join(firmwareDir, file));
		}
	}
	writeFileSync(join(firmwareDir, asset.name), data);

	const manifest = {
		version: release.tag_name,
		file: asset.name,
		size: asset.size,
		fetchedAt: new Date().toISOString()
	};
	writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
	console.log(`[fetch-firmware] Bundled firmware ${manifest.version} at static/firmware/${asset.name}`);
}

main().catch((error) => {
	console.error(`[fetch-firmware] ERROR: ${error.message}`);
	console.error('[fetch-firmware] No bundled firmware available; cannot build.');
	process.exit(1);
});
