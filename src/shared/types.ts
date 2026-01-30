// Shared types for Super Whisper

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ThemeName = 'dark' | 'light' | 'dracula' | 'nord' | 'retro' | 'monokai' | 'synthwave' | 'forest' | 'onedark' | 'gruvbox' | 'sunset' | 'catppuccin';

export interface Settings {
  apiKey: string;
  apiKeyValid: boolean;
  recordHotkey: string;
  cancelHotkey: string;
  microphoneId: string;
  bitrate: number;
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  silenceDetection: boolean;
  silenceThreshold: number;
  pauseDelay: number;
  copyToClipboard: boolean;
  autoPaste: boolean;
  playSound: boolean;
  saveTranscripts: boolean;
  saveAudio: boolean;
  totalCost: number;
  theme: ThemeName;
  gpuAcceleration: boolean;
  // Window positions
  mainWindowBounds?: WindowBounds;
  settingsWindowBounds?: WindowBounds;
  mainWindowMini?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  apiKeyValid: false,
  recordHotkey: 'CommandOrControl+Shift+Space',
  cancelHotkey: 'Escape',
  microphoneId: '',
  bitrate: 64000,
  sampleRate: 48000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  silenceDetection: true,
  silenceThreshold: 5,
  pauseDelay: 2500,
  copyToClipboard: true,
  autoPaste: true,
  playSound: true,
  saveTranscripts: false,
  saveAudio: false,
  totalCost: 0,
  theme: 'dark',
  gpuAcceleration: true,
};

export type TrayState = 'idle' | 'recording' | 'paused' | 'transcribing' | 'error';

export interface TranscriptionResult {
  text: string;
  duration: number;
  cost: number;
  error?: string;
  rawError?: string;
}

export interface RecordingData {
  audioBlob: ArrayBuffer;
  duration: number;
  filename: string;
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Recording
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_CANCEL: 'recording:cancel',
  RECORDING_PAUSE: 'recording:pause',
  RECORDING_RESUME: 'recording:resume',
  RECORDING_DATA: 'recording:data',

  // Transcription
  TRANSCRIPTION_RESULT: 'transcription:result',
  TRANSCRIPTION_ERROR: 'transcription:error',
  TRANSCRIPTION_PROGRESS: 'transcription:progress',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed',

  // Theme
  THEME_CHANGED: 'theme:changed',

  // API
  API_TEST: 'api:test',
  API_TEST_RESULT: 'api:test:result',

  // Tray
  TRAY_STATE: 'tray:state',

  // Window
  WINDOW_CLOSE: 'window:close',
  WINDOW_SHOW_SETTINGS: 'window:show:settings',
  WINDOW_SET_MINI: 'window:set-mini',

  // Cost
  COST_RESET: 'cost:reset',

  // Transcripts
  TRANSCRIPTS_OPEN_FOLDER: 'transcripts:open-folder',

  // Audio
  AUDIO_OPEN_FOLDER: 'audio:open-folder',

  // Error details
  ERROR_SHOW_DETAILS: 'error:show-details',

  // Debug
  DEBUG_LOG: 'debug:log',

  // Hotkeys
  HOTKEYS_PAUSE: 'hotkeys:pause',
  HOTKEYS_RESUME: 'hotkeys:resume',
} as const;
