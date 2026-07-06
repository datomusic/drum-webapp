<script lang="ts">
    import { onMount } from "svelte";
    import { _ } from "svelte-i18n";
    import { midiState } from "$lib/stores/midi.svelte";
    import { featureFlags } from "$lib/stores/featureFlags.svelte";
    import {
        firmwareUpgradeState,
        openFirmwareUpgrade,
        dismissFirmwareUpgrade,
        resetFirmwareUpgrade,
    } from "$lib/stores/firmwareUpgrade.svelte";
    import { isPreV1Firmware, isNewerVersion } from "$lib/utils/versioning";
    import { getLatestFirmware } from "$lib/config/firmware";
    import {
        uploadFirmware,
        downloadFirmwareBinary,
    } from "$lib/services/firmwareUpdater";
    import { createLogger } from "$lib/utils/logger";

    const logger = createLogger("FirmwareUpgrade");

    type Step = "prompt" | "downloading" | "uploading" | "rebooting";
    let step = $state<Step>("prompt");
    let errorMessage = $state<string | null>(null);
    let progressPercent = $state(0);
    let latestFirmware = $state<Awaited<
        ReturnType<typeof getLatestFirmware>
    > | null>(null);

    onMount(async () => {
        try {
            latestFirmware = await getLatestFirmware();
        } catch (error) {
            logger.warn(
                "Failed to fetch latest firmware info: " +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
    });

    // Auto-open the prompt once a v1.0.0+ device reports its firmware version
    // and a newer release is available, unless the user already dismissed it
    // for this connection. Pre-v1.0.0 devices lack the SysEx update mechanism
    // and are handled by the legacy flow instead.
    $effect(() => {
        if (
            featureFlags.sysexFirmwareUpgrade &&
            midiState.isConnected &&
            midiState.firmwareVersion &&
            !isPreV1Firmware(midiState.firmwareVersion) &&
            latestFirmware &&
            isNewerVersion(midiState.firmwareVersion, latestFirmware.version) &&
            !firmwareUpgradeState.dismissed &&
            !firmwareUpgradeState.open
        ) {
            step = "prompt";
            openFirmwareUpgrade();
        }
    });

    // After the device verifies the update it reboots into the new firmware
    // and reconnects on its own. Once it reports a version that's no longer
    // older than the bundled one, the upgrade is done, so close the dialog
    // automatically. The step guard (rather than a forced-mode guard) keeps
    // a forced-open prompt from closing instantly on an up-to-date device
    // while still auto-dismissing forced test runs after the reboot.
    $effect(() => {
        if (
            firmwareUpgradeState.open &&
            step === "rebooting" &&
            midiState.isConnected &&
            midiState.firmwareVersion &&
            latestFirmware &&
            !isNewerVersion(midiState.firmwareVersion, latestFirmware.version)
        ) {
            logger.info(
                `Device reconnected with firmware ${midiState.firmwareVersion}, closing upgrade dialog`,
            );
            handleDismiss();
        }
    });

    // On disconnect, reset so the prompt can show again for the next device.
    // The trial-boot reboot after a successful upload disconnects the device,
    // so don't reset while the dialog is open — the user is still mid-flow.
    $effect(() => {
        if (!midiState.isConnected && !firmwareUpgradeState.open) {
            resetFirmwareUpgrade();
            step = "prompt";
            errorMessage = null;
            progressPercent = 0;
        }
    });

    function handleDismiss() {
        dismissFirmwareUpgrade();
        step = "prompt";
        errorMessage = null;
        progressPercent = 0;
    }

    async function handleUpgrade() {
        errorMessage = null;

        if (!midiState.selectedOutput) {
            errorMessage = $_("fw_upgrade_failed");
            return;
        }

        try {
            step = "downloading";
            const firmware = latestFirmware ?? (await getLatestFirmware());
            const uf2 = await downloadFirmwareBinary(firmware);

            step = "uploading";
            progressPercent = 0;
            await uploadFirmware(uf2, ({ sentBytes, totalBytes }) => {
                progressPercent = Math.floor((sentBytes / totalBytes) * 100);
            });

            step = "rebooting";
        } catch (error) {
            logger.error(
                "Firmware upgrade failed: " +
                    (error instanceof Error ? error.message : String(error)),
            );
            step = "prompt";
            errorMessage = $_("fw_upgrade_failed");
        }
    }
</script>

{#if firmwareUpgradeState.open}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fw-upgrade-title"
    >
        <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="fw-upgrade-title" class="text-xl font-bold text-gray-900">
                {$_("fw_upgrade_title")}
            </h2>

            {#if step === "prompt"}
                <p class="mt-3 text-gray-700">
                    {$_("fw_upgrade_message", {
                        values: {
                            version: midiState.firmwareVersion || "?",
                            newVersion: latestFirmware?.version || "?",
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
                        {$_("fw_upgrade_button")}
                    </button>
                    <button
                        class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                        onclick={handleDismiss}
                    >
                        {$_("fw_upgrade_not_now_button")}
                    </button>
                </div>
            {:else if step === "downloading"}
                <p class="mt-3 text-gray-700">{$_("fw_upgrade_downloading")}</p>
            {:else if step === "uploading"}
                <p class="mt-3 text-gray-700">{$_("fw_upgrade_uploading")}</p>
                <div class="mt-4 h-3 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                        class="h-full rounded-full bg-green-500 transition-[width] duration-200"
                        style="width: {progressPercent}%"
                    ></div>
                </div>
                <p class="mt-2 text-sm text-gray-500">{progressPercent}%</p>
                <p class="mt-3 text-gray-700">{$_("fw_upgrade_keep_connected")}</p>
            {:else}
                <p class="mt-3 text-gray-700">{$_("fw_upgrade_rebooting")}</p>
                {#if firmwareUpgradeState.forced}
                    <div class="mt-4 flex gap-2">
                        <button
                            class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                            onclick={handleDismiss}
                        >
                            {$_("fw_upgrade_done_button")}
                        </button>
                    </div>
                {/if}
            {/if}
        </div>
    </div>
{/if}
