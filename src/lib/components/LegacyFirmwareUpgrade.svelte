<script lang="ts">
    import { _ } from "svelte-i18n";
    import { midiState, rebootToBootloader } from "$lib/stores/midi.svelte";
    import { featureFlags } from "$lib/stores/featureFlags.svelte";
    import {
        legacyUpgradeState,
        openLegacyFirmwareUpgrade,
        dismissLegacyFirmwareUpgrade,
        resetLegacyFirmwareUpgrade,
    } from "$lib/stores/legacyFirmwareUpgrade.svelte";
    import { isPreV1Firmware } from "$lib/utils/versioning";
    import { getLatestFirmware } from "$lib/config/firmware";
    import { createLogger } from "$lib/utils/logger";

    const logger = createLogger("LegacyFirmwareUpgrade");

    type Step = "prompt" | "working" | "instructions";
    let step = $state<Step>("prompt");
    let errorMessage = $state<string | null>(null);

    // Auto-open the prompt once a pre-v1.0.0 device reports its firmware
    // version, unless the user already dismissed it for this connection
    $effect(() => {
        if (
            featureFlags.legacyFirmwareUpgrade &&
            midiState.isConnected &&
            isPreV1Firmware(midiState.firmwareVersion) &&
            !legacyUpgradeState.dismissed &&
            !legacyUpgradeState.open
        ) {
            step = "prompt";
            openLegacyFirmwareUpgrade();
        }
    });

    // On disconnect, reset so the prompt can show again for the next device.
    // Entering UF2 downloader mode disconnects the device, so don't reset
    // while the dialog is open — the user still needs the instructions.
    $effect(() => {
        if (!midiState.isConnected && !legacyUpgradeState.open) {
            resetLegacyFirmwareUpgrade();
            step = "prompt";
            errorMessage = null;
        }
    });

    function handleDismiss() {
        dismissLegacyFirmwareUpgrade();
        step = "prompt";
        errorMessage = null;
    }

    function downloadFirmware(url: string) {
        const link = document.createElement("a");
        link.href = url;
        link.download = "";
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async function handleUpgrade() {
        errorMessage = null;

        if (!midiState.selectedOutput) {
            errorMessage = $_("legacy_fw_reset_failed");
            return;
        }

        step = "working";
        // Send the DRUM's RebootBootloader SysEx command (0x0B). The device
        // reboots into UF2 downloader mode and re-enumerates as a DRUMBOOT
        // mass storage drive.
        rebootToBootloader();

        try {
            const firmware = await getLatestFirmware();
            downloadFirmware(firmware.downloadUrl);
        } catch (error) {
            logger.warn(
                "Failed to download firmware: " +
                    (error instanceof Error ? error.message : String(error)),
            );
        }

        step = "instructions";
    }
</script>

{#if legacyUpgradeState.open}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-fw-title"
    >
        <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="legacy-fw-title" class="text-xl font-bold text-gray-900">
                {$_("legacy_fw_title")}
            </h2>

            {#if step === "prompt"}
                <p class="mt-3 text-gray-700">
                    {$_("legacy_fw_message", {
                        values: {
                            version: midiState.firmwareVersion || "?",
                        },
                    })}
                </p>
                {#if errorMessage}
                    <p class="mt-2 text-red-600">{errorMessage}</p>
                {/if}
                <div class="mt-4 flex gap-2">
                    <button
                        class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                        onclick={handleUpgrade}
                    >
                        {$_("legacy_fw_upgrade_button")}
                    </button>
                    <button
                        class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                        onclick={handleDismiss}
                    >
                        {$_("legacy_fw_not_now_button")}
                    </button>
                </div>
            {:else if step === "working"}
                <p class="mt-3 text-gray-700">{$_("legacy_fw_working")}</p>
            {:else}
                <p class="mt-3 text-gray-700">
                    {$_("legacy_fw_instructions_downloaded")}
                </p>
                <ol class="mt-3 list-decimal space-y-2 pl-5 text-gray-700">
                    <li>{$_("legacy_fw_instructions_step1")}</li>
                    <li>{$_("legacy_fw_instructions_step2")}</li>
                    <li>{$_("legacy_fw_instructions_step3")}</li>
                </ol>
                <div class="mt-4 flex gap-2">
                    <button
                        class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                        onclick={handleDismiss}
                    >
                        {$_("legacy_fw_done_button")}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}
