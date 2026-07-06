// src/lib/services/legacyBootloader.ts
//
// Pre-v1.0.0 DRUM firmware has no MIDI SysEx firmware upgrade mechanism.
// These devices are rebooted into the RP2350 UF2 downloader (BOOTSEL) mode
// with the well-known UART reset procedure: open the device's USB serial
// port at 1200 baud and close it again ("1200 bps touch"). The device then
// re-enumerates as a 'DRUMBOOT' mass storage drive that accepts UF2 files.

import { createLogger } from '$lib/utils/logger';

const logger = createLogger('LegacyBootloader');

// Raspberry Pi USB vendor ID, used by RP2350-based devices
const RP2_USB_VENDOR_ID = 0x2e8a;

// The 1200 bps touch: opening and closing the CDC port at this baud rate
// signals the firmware to reset into the UF2 bootloader
const RESET_BAUD_RATE = 1200;

export function isWebSerialSupported(): boolean {
	return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Prompts the user to pick the DRUM's serial port and performs the 1200 bps
 * touch to reboot the device into UF2 downloader mode.
 * @throws Error when Web Serial is unsupported, the user cancels the port
 *         picker, or the port cannot be opened.
 */
export async function enterUf2DownloaderMode(): Promise<void> {
	if (!isWebSerialSupported()) {
		throw new Error('Web Serial API is not supported in this browser.');
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const serial = (navigator as any).serial;
	const port = await serial.requestPort({
		filters: [{ usbVendorId: RP2_USB_VENDOR_ID }]
	});

	logger.info(`Opening serial port at ${RESET_BAUD_RATE} baud to trigger UF2 downloader mode`);
	await port.open({ baudRate: RESET_BAUD_RATE });

	try {
		await port.close();
	} catch (error) {
		// The device typically resets as soon as the port opens, so closing can
		// fail with a disconnection error. That means the reset worked.
		logger.debug(
			`Serial port close after reset: ${error instanceof Error ? error.message : String(error)}`
		);
	}

	logger.info('1200 bps touch sent, device should reboot into DRUMBOOT mode');
}
