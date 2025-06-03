**Document Version:** 0.1 **Date:** May 27, 2025
## 1. Introduction
This document outlines the requirements for a companion web application for the Dato DRUM, a sample-based drum machine. The web app will facilitate firmware updates, sample management, and potentially advanced settings by connecting the Dato DRUM to a Web USB/Web MIDI enabled browser.
## 2. General Goals & Principles
- **Target Audience:** Beginners, including children.
- **Interface:** Graphic-focused, not text-heavy, using simple language.
- **Performance:** Lightweight, ensuring smooth operation on older hardware (e.g., Chromebooks) and less powerful smartphones/tablets.
- **Accessibility:** Runs on Web USB / Web MIDI supported browsers.
- **Internationalization:** Initial languages: English, German, Dutch. Text messages in the locales use simple language also understandable by children (but
> not too wordy or explanatory or childish, keep it short and sweet)
## 3. Possible Stack
- **Framework:** Svelte 5 / SvelteKit
- **Styling:** Tailwind CSS
- **Internationalization:** `svelte-i18n`
- **Mobile Packaging (Optional):** Ionic Capacitor with `capacitor-musetrainer-midi` for iOS.
- **CI/Deployment:** GitHub Actions for CI, deployment to a web server.
- **Design/Wireframing Tool:** Penpot.
## 4. Meta Functionality
### 4.1. Browser USB/MIDI Support Check
- **Requirement:** Check if the user's browser supports Web USB/Web MIDI.
- **Guidance:** If not supported, kindly guide the user on how to switch browsers or enable features.
    - **TBD:** Specific information/links for guidance (e.g., direct download links, guides for enabling flags).
        
### 4.2. Device Connection Instructions
- **Requirement:** Provide instructions on how to connect the Dato DRUM.
- **Device Detail:** Dato DRUM is a class-compliant MIDI device (no special drivers needed).
- **Focus:** Instructions will primarily cover browser permissions for Web MIDI/Web USB.
    - **TBD:** Outline of typical permission prompts for different OS (Windows, macOS, Linux, ChromeOS).
        
### 4.3. Firmware Update Functionality
- **Requirement:** Allow users to update the Dato DRUM's firmware.
- **Firmware Source:** Firmware (.UF2 file) will be fetched automatically from a server (e.g., latest release from a GitHub repository).
- **Update Process:**
    1. App sends a MIDI SysEx command sequence to the Dato DRUM to prepare it for the update.
        
    2. The .UF2 file is then transferred to the device.
        
        - **TBD:** Exact mechanism for .UF2 file transfer (e.g., device appears as Mass Storage for drag & drop, or direct push via Web USB).
            
- **Version Check:**
    - The app will retrieve the current firmware version from the device.
        
    - Preferred method: MIDI SysEx command. Alternative: Reading USB device descriptors.
        
- **Failure Handling:**
    - **TBD:** How the app and device should handle interrupted or failed firmware updates (recovery process, user guidance).
        
### 4.4. Language Selection
- **Requirement:** Allow users to select their preferred language (English, German, Dutch initially).
## 5. Core Functionality
### 5.1. Sample Table & Interaction
- **Requirement:** Display a table of the 32 sample slots.
- **Initial State:** Upon connecting the Dato DRUM, the app will **read the current sample configuration** (audio, names, colors if stored on device) and populate the table.
- **Row Information:** Each row will display:
    - Filename/Display Name (editable in-app) 
    - MIDI note number
    - Assigned color
        
- **Interaction:**
    - Clicking a row highlights it ("selects" the sample).
    - Clicking a row sends a MIDI Note On, followed by a Note Off after a configurable delay (global setting for auditioning).
        
- **Overwrite Behavior:** Replacing a sample (drag & drop, record) will **overwrite the existing sample in that slot immediately** without a confirmation prompt.
    - **Potential Future Feature:** An "Undo" button to revert the last sample change.
        
### 5.2. Sample Loading & Management
- **Drag & Drop:** Users can drag and drop `.wav` files (and other browser-decodable audio formats) onto a sample row.
- **Audio Format Conversion:**
    - The Dato DRUM expects **44.1kHz, 16-bit, mono WAV files**.
    - The web app **must convert** any dropped/selected audio files to this format.
    - Audio longer than 1 second will be **truncated to 1 second**.
        
- **Recording New Sounds:**
    - A "Record" button on each row allows recording audio up to 1 second.
    - **Audio Input:** Initially, use the system's default microphone.
        - **TBD:** Support for selecting other audio input sources.
    - **Editing:** No audio editing features (trimming, normalizing) in the first version.
        
- **Transmission to Device:**
    - Sample data will be transmitted to the Dato DRUM via **SysEx over Web MIDI**.
    - The app will enforce uploading **only one sample at a time**. The UI will block further sample operations until the current transfer is complete.
        
### 5.3. Backup Samples
- **Requirement:** Allow users to back up all 32 samples and their metadata.
- **Format:** A single downloadable **`.zip` file**.
    - The `.zip` will contain the 32 individual 1s/44.1kHz/16-bit/mono `.wav` files.
    - It will also include a metadata file (e.g., `samples.json` or `samples.ini`) storing filenames/display names, MIDI note assignments, and colors.
    - **Note:** The alternative of using UF2 format for backups was discussed but deemed less suitable than `.zip` for this purpose.
        
- **Content:** The backup will include audio data and metadata (arrangement, names, colors).
### 5.4. Reset Samples to Factory Default
- **Requirement:** Allow users to reset all samples to the factory defaults.
- **Source:** The factory default samples will be **embedded within the web application**.
## 6. Advanced Functionality
- **Status:** Currently **OUT OF SCOPE** for the initial version to focus on core functionality.
- Original ideas included:
    - MIDI configuration (channels, clock, velocity)
    - Timing settings (max BPM, divisor)
    - Device brightness and color palette customization.
        
## 7. Layout (Primarily Sample Management View)
- **Main View:** A table or grid representing the 32 sample slots.
- **Per Slot Display:**
    - Filename/Display Name
    - MIDI Note Number
    - Color indicator
    - Record button
        
- **Interaction:**
    - Clickable rows for selection and auditioning.
    - Drag & drop target for `.wav` files onto rows.
        
- **Visual Feedback:**
    - Clear indication of connected/disconnected device status.
    - Progress indication for sample transfers and firmware updates.
    - Highlighting for selected sample row.
        
- **Color Assignment:**
    - **TBD:** How users will assign colors to samples (e.g., color picker, predefined palette matching device LED capabilities).
        
## 8. Other Pages
- **404 Page:** A custom "Not Found" page.
## 9. Summary of TBD / Open for Discussion
- **Meta - Browser Support:** Specific guidance/links for users with unsupported browsers.
- **Meta - Connection Instructions:** Detailed permission prompts for various OS.
- **Meta - Firmware Update:**
    - Exact mechanism for .UF2 file transfer post-SysEx command.
    - Robust handling and user guidance for failed firmware updates.
        
- **Core - Recording:** Future support for selecting specific audio input sources (beyond default mic).
- **Layout - Color Assignment:** UI/UX for how users assign colors to samples (color picker vs. predefined palette).
- **General:**
    - Specifics of the "undo" functionality for sample replacement.
    - Detailed error messaging and user feedback for various scenarios.
    - Consideration for basic accessibility features (keyboard navigation, ARIA attributes).