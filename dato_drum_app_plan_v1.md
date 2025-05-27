**Document Version:** 0.1 **Date:** May 27, 2025 **Based on Specification:** `dato_drum_app_spec_v1`

This plan outlines a phased approach to developing the Dato DRUM companion web application.

## Phase 0: Project Setup & Foundation (The "Skeleton")

_Goal: Establish the basic project structure, tools, and a minimal runnable app._

1. **Initialize SvelteKit Project:**
    
    - Set up a new SvelteKit project.
        
    - Choose preferred options (TypeScript/JavaScript, ESLint, Prettier).
        
2. **Version Control:**
    
    - Initialize a Git repository.
        
    - Create a remote repository (e.g., on GitHub).
        
3. **Install Core Dependencies:**
    
    - Tailwind CSS: Follow SvelteKit integration guides.
        
    - `svelte-i18n`: For internationalization.
        
4. **Basic UI Shell:**
    
    - Create a main layout component (`__layout.svelte` or `+layout.svelte` depending on SvelteKit version).
        
    - Define basic regions (e.g., header for language selection/connection status, main content area).
        
5. **Internationalization Setup:**
    
    - Configure `svelte-i18n` with initial language files (EN, DE, NL) for a few placeholder strings.
        
    - Implement a basic language switcher UI element.
        
6. **Styling Foundation:**
    
    - Configure Tailwind CSS (e.g., `tailwind.config.js`).
        
    - Define any global styles or theme settings if necessary.
        
7. **Initial Component Stubs:**
    
    - Create placeholder Svelte components for major UI sections (e.g., `SampleTable.svelte`, `FirmwareUpdate.svelte`, `DeviceConnection.svelte`).
        

**Checkpoint:** A runnable SvelteKit app with basic layout, Tailwind CSS working, and i18n setup for placeholder text.

## Phase 1: Device Communication & Core MIDI (The "Nervous System")

_Goal: Establish communication with the Dato DRUM via Web MIDI and implement basic interactions._

1. **Web MIDI API Integration:**
    
    - Create a Svelte store or service to manage MIDI state (inputs, outputs, connected device).
        
    - Implement logic to request MIDI access and list available MIDI devices.
        
2. **Device Connection/Disconnection Logic:**
    
    - Allow users to select the Dato DRUM from a list of MIDI devices.
        
    - Handle device connection and disconnection events.
        
    - Display connection status in the UI.
        
3. **Firmware Version Reading (SysEx):**
    
    - Implement sending the SysEx command to request the firmware version.
        
    - Implement parsing the SysEx response to display the version.
        
    - _(Dependency: Requires knowing the exact SysEx command sequence)._
        
4. **Auditioning Samples (MIDI Note On/Off):**
    
    - In a basic version of the `SampleTable.svelte`, implement sending MIDI Note On/Off messages when a (placeholder) sample row is clicked.
        
    - Make the note-off delay configurable (global setting for now).
        

**Checkpoint:** The app can connect to the Dato DRUM, display its firmware version, and send MIDI notes to audition sounds.

## Phase 2: Sample Management - Part 1 (Display & Local Loading)

_Goal: Display sample slots and allow users to load local audio files into them, including conversion._

1. **Reading Sample Configuration from Device (SysEx - Initial):**
    
    - Implement logic to send SysEx commands to read the current configuration of all 32 sample slots (name, color, MIDI note, audio data or identifier).
        
    - _(Dependency: Requires knowing the exact SysEx sequences and data format for sample configurations)._
        
    - If reading full audio via SysEx is complex initially, start by reading metadata (name, color, note number) and assume factory default audio or placeholders.
        
2. **Populate `SampleTable.svelte`:**
    
    - Dynamically render the 32 sample slots based on data read from the device or default data.
        
    - Display placeholder/actual Filename, MIDI Note Number, and Color for each slot.
        
3. **Drag & Drop Audio Files:**
    
    - Implement drag & drop functionality onto sample rows in `SampleTable.svelte`.
        
4. **Audio File Handling & Conversion:**
    
    - Use browser APIs to read dropped audio files.
        
    - Implement client-side audio conversion logic:
        
        - Decode various audio formats (leveraging browser capabilities).
            
        - Resample to 44.1kHz.
            
        - Convert to 16-bit.
            
        - Convert to mono.
            
        - Truncate to 1 second.
            
    - Display the (new) filename in the table for the dropped sample.
        

**Checkpoint:** The app can display sample slots (ideally reflecting device state), and users can drag, drop, and convert audio files into these slots locally within the app.

## Phase 3: Sample Management - Part 2 (Recording & Device Transmission)

_Goal: Enable recording new samples and transmitting them to the Dato DRUM._

1. **Browser Microphone Recording:**
    
    - Implement audio recording using `MediaRecorder` API.
        
    - Add a "Record" button to each sample row.
        
    - Ensure recording is limited to 1 second and processed into the required WAV format.
        
2. **SysEx for Sample Transmission:**
    
    - Implement the SysEx logic to transmit a single prepared sample (1s, 44.1kHz, 16-bit, mono WAV data) to a specific slot on the Dato DRUM.
        
    - _(Dependency: Requires knowing the exact SysEx command sequence for sample upload)._
        
3. **UI for Sample Upload:**
    
    - When a sample is dropped or recorded, trigger the upload to the device.
        
    - Enforce one-upload-at-a-time: Disable other sample interactions (drag/drop, record) during an active transfer.
        
    - Provide visual feedback for the transfer (loading state, success, failure).
        
4. **Update UI Post-Transmission:**
    
    - After successful transmission, ensure the app's `SampleTable` accurately reflects the change on the device (if not already updated by an event from the device).
        

**Checkpoint:** Users can record new samples or use dropped files, and these samples are successfully transferred to the specified slot on the Dato DRUM.

## Phase 4: Data Persistence & Utilities (Backup/Restore & Defaults)

_Goal: Implement functionality for sample backup and resetting to factory defaults._

1. **Factory Default Samples:**
    
    - Bundle the factory default WAV files (and their metadata: names, colors, MIDI notes) within the app.
        
    - Implement a "Reset to Factory Defaults" button.
        
    - This function should iterate through all 32 slots, transmitting each factory default sample to the device and updating the UI.
        
2. **Backup Samples Logic:**
    
    - Implement a "Backup Samples" button.
        
    - Functionality:
        
        1. Retrieve current configuration of all 32 samples from the device (or app state if it's reliably in sync).
            
        2. Prepare the 32 individual `.wav` files (1s, 44.1kHz, 16-bit, mono).
            
        3. Create a metadata file (`samples.json` or `.ini`) with names, MIDI notes, colors.
            
        4. Use a library (e.g., `jszip`) to create a `.zip` file in the browser.
            
        5. Trigger download of the `.zip` file.
            

**Checkpoint:** Users can reset the device to factory samples and back up the current set of samples to a downloadable zip file.

## Phase 5: Firmware Update Flow (The "Brain Surgery")

_Goal: Implement the complete firmware update process._

1. **Fetch Firmware from Server:**
    
    - Implement logic to fetch the latest firmware information (e.g., version, download URL for .UF2) from your server/GitHub releases.
        
2. **Firmware Update UI:**
    
    - Display current device firmware version and available server version.
        
    - Provide a button to initiate the update.
        
3. **SysEx Command for Update Mode:**
    
    - Implement sending the SysEx command to put the Dato DRUM into firmware update mode.
        
4. **.UF2 File Transfer:**
    
    - Implement the chosen mechanism for transferring the .UF2 file.
        
        - If Mass Storage: Guide user to download .UF2 and drag it to the device (which appears as a drive).
            
        - If Web USB push: Implement direct file transfer.
            
    - _(Dependency: Resolution of TBD: "Exact mechanism for .UF2 file transfer")._
        
5. **Progress and Feedback:**
    
    - Provide clear UI feedback throughout the process (downloading firmware, putting device in update mode, transferring, success, failure).
        
    - Handle potential errors and guide the user.
        
    - _(Dependency: Resolution of TBD: "Robust handling and user guidance for failed firmware updates")._
        

**Checkpoint:** Users can successfully update the Dato DRUM's firmware through the web app.

## Phase 6: UI Polish, Language & Remaining Meta (The "Flesh & Polish")

_Goal: Finalize UI elements, complete internationalization, and implement remaining meta features._

1. **Full Internationalization:**
    
    - Ensure all user-facing strings are in language files and translated for EN, DE, NL.
        
    - Test language switching thoroughly.
        
2. **Browser Support Check & Guidance UI:**
    
    - Implement the UI to inform users if their browser is not supported and provide guidance.
        
    - _(Dependency: Resolution of TBD: "Specific guidance/links for users with unsupported browsers")._
        
3. **Device Connection Instructions UI:**
    
    - Create a clear, simple UI page or modal for connection instructions.
        
    - _(Dependency: Resolution of TBD: "Detailed permission prompts for various OS")._
        
4. **404 Page:**
    
    - Create a user-friendly 404 page.
        
5. **Visual Feedback Refinements:**
    
    - Ensure all visual feedback (connection status, progress, selection highlights) is clear and consistent.
        
6. **Layout - Color Assignment UI:**
    
    - Implement the UI for assigning colors to samples.
        
    - _(Dependency: Resolution of TBD: "UI/UX for how users assign colors to samples (color picker vs. predefined palette)")._
        
7. **"Undo" Feature (Optional but Recommended):**
    
    - If prioritized, implement the "undo" for the last sample replacement.
        
8. **General Error Handling & Messaging:**
    
    - Review and implement comprehensive error handling and user-friendly messages for various scenarios.
        
9. **Basic Accessibility Review:**
    
    - Check for keyboard navigation, focus states, and add ARIA attributes where necessary.
        

**Checkpoint:** The app is feature-complete for v1, well-polished, and fully internationalized.

## Phase 7: Testing & Refinement

_Goal: Ensure stability, performance, and usability across target environments._

1. **Cross-Browser Testing:**
    
    - Test thoroughly on latest versions of Chrome, Edge, Opera (and other Web MIDI/USB supporting browsers).
        
2. **Device Testing:**
    
    - Test with the actual Dato DRUM hardware extensively.
        
    - If possible, test on target "older hardware" (Chromebooks, slower devices).
        
3. **User Acceptance Testing (UAT):**
    
    - Get feedback from target users (beginners, children if feasible).
        
4. **Bug Fixing & Performance Optimization:**
    
    - Address issues found during testing.
        
    - Profile and optimize performance if needed, especially for audio processing and device communication.
        

**Checkpoint:** The app is stable, performs well, and is user-friendly.

## Phase 8: Documentation & Deployment

_Goal: Prepare for release._

1. **User Documentation (if needed):**
    
    - Create any necessary user guides or FAQs (might be integrated into the app itself).
        
2. **CI/CD Setup (GitHub Actions):**
    
    - Set up GitHub Actions for automated builds, tests, and deployment.
        
3. **Deployment:**
    
    - Deploy the application to your chosen web server.
        

**Checkpoint:** The app is deployed and accessible to users.

This plan is a guideline and can be adjusted as development progresses and more TBDs are resolved. Breaking down tasks into smaller, manageable chunks within these phases will be key. Good luck!