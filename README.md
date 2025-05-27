# Dato DRUM Web App

This is a companion web application for the Dato DRUM, a sample-based drum machine. It is designed to facilitate firmware updates, sample management, and potentially advanced settings by connecting the Dato DRUM to a Web USB/Web MIDI enabled browser.

It is very much a work in progress so the features below might or might not be present.

## Features

*   **Device Connection**: Checks for Web USB/Web MIDI support and guides the user through connecting the Dato DRUM.
*   **Firmware Update**: Allows users to update the Dato DRUM's firmware by fetching the latest `.UF2` file from a server.
*   **Sample Management**:
    *   Displays 32 sample slots with editable names, MIDI note numbers, and assigned colors.
    *   Supports drag & drop of `.wav` (and other browser-decodable) audio files.
    *   Automatically converts audio to 44.1kHz, 16-bit, mono WAV, and truncates to 1 second.
    *   Enables recording new 1-second samples via the microphone.
    *   Transmits samples to the device via MIDI SysEx.
*   **Backup & Restore**: Allows backing up all 32 samples and their metadata to a single `.zip` file.
*   **Factory Reset**: Resets all samples on the device to embedded factory defaults.
*   **Internationalization**: Supports English, German, and Dutch languages with simple, child-friendly text.

## Technology Stack

This project is built with:

*   **Framework**: SvelteKit
*   **Styling**: Tailwind CSS
*   **Internationalization**: `svelte-i18n`
*   **Device Communication**: Web MIDI API (with SYSEX support)

## Getting Started

### Development

To set up the project locally:

1.  **Clone the repository**:
    ```bash
    git clone git@github.com:datomusic/drum-webapp.git
    cd drum-webapp
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    # or pnpm install
    # or yarn
    ```
3.  **Start the development server**:
    ```bash
    npm run dev
    # or start the server and open the app in a new browser tab
    npm run dev -- --open
    ```

### Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
