// src/lib/utils/logger.ts

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    OFF = 4
}

export interface LoggerConfig {
    level: LogLevel;
    enableMidiMessages: boolean;
    enableMidiRealtime: boolean;
    enableSysEx: boolean;
    enableFirmwareDetection: boolean;
}

// Default configuration - can be modified at runtime
let config: LoggerConfig = {
    level: LogLevel.INFO,
    enableMidiMessages: false,     // Disable regular MIDI note messages by default
    enableMidiRealtime: false,     // Disable MIDI realtime messages (clock, etc.)
    enableSysEx: true,             // Keep SysEx messages enabled for firmware detection
    enableFirmwareDetection: true  // Keep firmware detection logs enabled
};

export function setLoggerConfig(newConfig: Partial<LoggerConfig>): void {
    config = { ...config, ...newConfig };
}

export function getLoggerConfig(): LoggerConfig {
    return { ...config };
}

class Logger {
    private prefix: string;

    constructor(prefix: string) {
        this.prefix = prefix;
    }

    debug(message: string, category?: 'midi' | 'sysex' | 'firmware' | 'realtime'): void {
        if (config.level > LogLevel.DEBUG) return;
        if (!this.shouldLog(category)) return;
        console.debug(`[${this.prefix}] ${message}`);
    }

    info(message: string, category?: 'midi' | 'sysex' | 'firmware' | 'realtime'): void {
        if (config.level > LogLevel.INFO) return;
        if (!this.shouldLog(category)) return;
        console.info(`[${this.prefix}] ${message}`);
    }

    warn(message: string, category?: 'midi' | 'sysex' | 'firmware' | 'realtime'): void {
        if (config.level > LogLevel.WARN) return;
        if (!this.shouldLog(category)) return;
        console.warn(`[${this.prefix}] ${message}`);
    }

    error(message: string, category?: 'midi' | 'sysex' | 'firmware' | 'realtime'): void {
        if (config.level > LogLevel.ERROR) return;
        if (!this.shouldLog(category)) return;
        console.error(`[${this.prefix}] ${message}`);
    }

    private shouldLog(category?: 'midi' | 'sysex' | 'firmware' | 'realtime'): boolean {
        if (!category) return true;

        switch (category) {
            case 'midi':
                return config.enableMidiMessages;
            case 'realtime':
                return config.enableMidiRealtime;
            case 'sysex':
                return config.enableSysEx;
            case 'firmware':
                return config.enableFirmwareDetection;
            default:
                return true;
        }
    }
}

export function createLogger(prefix: string): Logger {
    return new Logger(prefix);
}

// Convenience function to check if MIDI message is a realtime message
export function isMidiRealtimeMessage(statusByte: number): boolean {
    return statusByte >= 0xF8; // 0xF8-0xFF are realtime messages
}

// Convenience function to check if MIDI message is a system common message
export function isMidiSystemMessage(statusByte: number): boolean {
    return statusByte >= 0xF0 && statusByte < 0xF8; // 0xF0-0xF7 are system messages
}

// Global debugging utilities - available in browser console
declare global {
    interface Window {
        drumLoggerConfig: {
            setLevel: (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'OFF') => void;
            enableMidi: (enable: boolean) => void;
            enableSysEx: (enable: boolean) => void;
            enableFirmware: (enable: boolean) => void;
            enableRealtime: (enable: boolean) => void;
            showConfig: () => void;
            enableAll: () => void;
            quietMode: () => void;
            debugMode: () => void;
        };
    }
}

// Make logger configuration available globally for debugging
if (typeof window !== 'undefined') {
    window.drumLoggerConfig = {
        setLevel: (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'OFF') => {
            const levelMap = {
                DEBUG: LogLevel.DEBUG,
                INFO: LogLevel.INFO,
                WARN: LogLevel.WARN,
                ERROR: LogLevel.ERROR,
                OFF: LogLevel.OFF
            };
            setLoggerConfig({ level: levelMap[level] });
            console.log(`🥁 Log level set to ${level}`);
        },

        enableMidi: (enable: boolean) => {
            setLoggerConfig({ enableMidiMessages: enable });
            console.log(`🥁 MIDI messages ${enable ? 'enabled' : 'disabled'}`);
        },

        enableSysEx: (enable: boolean) => {
            setLoggerConfig({ enableSysEx: enable });
            console.log(`🥁 SysEx messages ${enable ? 'enabled' : 'disabled'}`);
        },

        enableFirmware: (enable: boolean) => {
            setLoggerConfig({ enableFirmwareDetection: enable });
            console.log(`🥁 Firmware detection ${enable ? 'enabled' : 'disabled'}`);
        },

        enableRealtime: (enable: boolean) => {
            setLoggerConfig({ enableMidiRealtime: enable });
            console.log(`🥁 MIDI realtime messages ${enable ? 'enabled' : 'disabled'}`);
        },

        showConfig: () => {
            const config = getLoggerConfig();
            console.log('🥁 Current logger configuration:', {
                level: Object.keys(LogLevel)[config.level],
                enableMidiMessages: config.enableMidiMessages,
                enableMidiRealtime: config.enableMidiRealtime,
                enableSysEx: config.enableSysEx,
                enableFirmwareDetection: config.enableFirmwareDetection
            });
        },

        enableAll: () => {
            setLoggerConfig({
                level: LogLevel.DEBUG,
                enableMidiMessages: true,
                enableMidiRealtime: true,
                enableSysEx: true,
                enableFirmwareDetection: true
            });
            console.log('🥁 All logging enabled (DEBUG mode)');
        },

        quietMode: () => {
            setLoggerConfig({
                level: LogLevel.WARN,
                enableMidiMessages: false,
                enableMidiRealtime: false,
                enableSysEx: false,
                enableFirmwareDetection: true
            });
            console.log('🥁 Quiet mode enabled (WARN level, firmware only)');
        },

        debugMode: () => {
            setLoggerConfig({
                level: LogLevel.DEBUG,
                enableMidiMessages: false,
                enableMidiRealtime: false,
                enableSysEx: true,
                enableFirmwareDetection: true
            });
            console.log('🥁 Debug mode enabled (DEBUG level, SysEx + firmware)');
        }
    };

    // Log instructions on load
    setTimeout(() => {
        console.log('🥁 Dato DRUM Logger Controls:');
        console.log('  drumLoggerConfig.showConfig() - Show current settings');
        console.log('  drumLoggerConfig.debugMode() - Enable debug mode (recommended)');
        console.log('  drumLoggerConfig.quietMode() - Quiet mode (warnings only)');
        console.log('  drumLoggerConfig.enableAll() - Enable all logging');
        console.log('  drumLoggerConfig.setLevel("DEBUG"|"INFO"|"WARN"|"ERROR"|"OFF")');
        console.log('  drumLoggerConfig.enableMidi(true/false) - Toggle MIDI note messages');
        console.log('  drumLoggerConfig.enableSysEx(true/false) - Toggle SysEx messages');
    }, 1000);
}