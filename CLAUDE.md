# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dato DRUM Web App is a companion web application for the Dato DRUM hardware - a sample-based drum machine. The app enables firmware updates, sample management, and device interaction through Web MIDI/Web USB APIs.

**Key Features:**
- Device connection via Web MIDI API with SysEx support
- 32-sample slot management with drag & drop audio file support
- Audio conversion (44.1kHz, 16-bit, mono, 1-second max)
- Microphone recording capability
- Sample backup/restore via zip files
- Firmware update functionality
- Multi-language support (English, German, Dutch)

## Technology Stack

- **Framework**: SvelteKit with Svelte 5
- **Styling**: Tailwind CSS v4 
- **TypeScript**: Full TypeScript support with strict mode
- **Internationalization**: `svelte-i18n`
- **Build**: Vite with static adapter
- **Deployment**: Static site with base path `/playground/drum-webapp`

## Development Commands

```bash
# Development server
npm run dev
npm run dev -- --open  # Opens in browser

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run check
npm run check:watch  # Watch mode
```

## Code Architecture

### Core Systems

**MIDI Communication** (`src/lib/stores/midi.ts`)
- Central MIDI state management using Svelte stores
- Device connection/disconnection handling
- SysEx message parsing for firmware version detection
- MIDI note playback with configurable duration (100ms default)
- Filters for Dato DRUM device detection: 'DRUM', 'Dato DRUM', 'Pico'

**Sample Management** (`src/lib/components/SampleTable.svelte`)
- 32 sample slots organized in 4 tracks of 8 samples each
- Non-consecutive MIDI note mapping coupled with LED colors
- Each sample has: MIDI note number, LED color RGB values, simulated button colors

**Sample Transfer** (MIDI SDS Protocol)
- `src/lib/services/sdsProtocol.ts`: MIDI Sample Dump Standard (SDS) implementation
- `src/lib/services/audioProcessor.ts`: Audio processing and format conversion
- `src/lib/stores/sampleUpload.ts`: Upload queue management with Svelte 5 runes
- SDS handshaking with ACK/NAK responses and timeout fallback
- 16-bit PCM data packets with checksum validation
- Progress tracking per sample with stage-based updates
- Automatic audio conversion to device format (44.1kHz, 16-bit, mono, 1s max)

**Drag & Drop** (`src/lib/stores/dragDropStore.ts`)
- Global drag state management
- File type validation for audio files
- Window-level drag overlay system

### Key Components

- `DeviceConnection.svelte`: MIDI device selection and connection UI
- `SampleTable.svelte`: Main 4x8 grid of sample slots with track organization
- `Track.svelte`: Individual track component containing 8 sample buttons
- `SampleButton.svelte` / `Voice.svelte`: Individual sample slot components

### Data Flow

1. Device connection via Web MIDI API requests SysEx permissions
2. Firmware version retrieved via custom Dato protocol (F0 00 22 01 65 01 F7)
3. Sample data organized by tracks with coupled MIDI notes and colors
4. Audio files drag-dropped onto Voice components trigger upload flow:
   - File validation (audio format check)
   - Audio processing: decode → mono → resample to 44.1kHz → 16-bit PCM → trim to 1s max
   - Add to upload queue with target slot (30-61)
   - SDS transfer: Dump Header → Data Packets (with ACK/NAK handshaking) → Complete
5. Progress feedback through reactive Svelte 5 stores

### Configuration

**Firmware** (`src/lib/config/firmware.ts`): Contains latest firmware version constant

**Color System** (`src/lib/utils/colors.ts`): LED color simulation for UI representation

**Base Path**: Configured for `/playground/drum-webapp` deployment path

### Internationalization

Locale files in `src/locales/` with child-friendly, simple language. Translation keys focus on brief, clear messaging suitable for beginner users including children.

## Development Guidelines

- Maintain strict TypeScript compliance
- Follow existing MIDI note/color coupling patterns when adding samples
- Respect 100ms note duration for MIDI playback
- Sample uploads use MIDI SDS protocol with 20ms packet timeout and 2s header timeout
- Use existing Svelte 5 patterns (runes, snippets, $derived, $state)
- Keep internationalization messages simple and brief
- Test MIDI functionality requires actual Dato DRUM hardware connection
- Custom Dato protocol (F0 00 22 01 65) used for device management only (firmware, storage, format)
- SDS protocol (F0 7E 65) used for sample transfers only

Always refer to the documentation first before assuming something works a certain way
Svelte 5 documentation links are here: https://svelte.dev/llms.txt
https://svelte.dev/docs/svelte/llms.txt
https://svelte.dev/docs/kit/llms.txt
Use Playwright only when requested

When removing git-tracked files, use `git rm`. For untracked files, use `trash`. Don't use `rm`
- don't use emoji's unless instructed