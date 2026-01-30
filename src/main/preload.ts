import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC channels to avoid module resolution issues in sandbox
const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed',
  API_TEST: 'api:test',
  RECORDING_DATA: 'recording:data',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_CANCEL: 'recording:cancel',
  RECORDING_PAUSE: 'recording:pause',
  RECORDING_RESUME: 'recording:resume',
  COST_RESET: 'cost:reset',
  TRANSCRIPTS_OPEN_FOLDER: 'transcripts:open-folder',
  AUDIO_OPEN_FOLDER: 'audio:open-folder',
  WINDOW_CLOSE: 'window:close',
  WINDOW_SHOW_SETTINGS: 'window:show:settings',
  WINDOW_SET_MINI: 'window:set-mini',
  THEME_CHANGED: 'theme:changed',
  DEBUG_LOG: 'debug:log',
  HOTKEYS_PAUSE: 'hotkeys:pause',
  HOTKEYS_RESUME: 'hotkeys:resume',
  ERROR_SHOW_DETAILS: 'error:show-details',
  ERROR_DATA: 'error:data',
};

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => {
    return ipcRenderer.invoke(IPC.SETTINGS_GET);
  },

  updateSettings: (settings: Record<string, unknown>) => {
    return ipcRenderer.invoke(IPC.SETTINGS_UPDATE, settings);
  },

  onSettingsChanged: (callback: (settings: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: unknown) => callback(settings);
    ipcRenderer.on(IPC.SETTINGS_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.SETTINGS_CHANGED, handler);
  },

  // API
  testApiKey: (apiKey: string) => {
    ipcRenderer.send(IPC.DEBUG_LOG, 'PRELOAD', 'testApiKey called with key length:', apiKey?.length || 0);
    ipcRenderer.send(IPC.DEBUG_LOG, 'PRELOAD', 'Invoking IPC:', IPC.API_TEST);
    return ipcRenderer.invoke(IPC.API_TEST, apiKey).then((result: unknown) => {
      ipcRenderer.send(IPC.DEBUG_LOG, 'PRELOAD', 'testApiKey result:', JSON.stringify(result));
      return result;
    }).catch((err: Error) => {
      ipcRenderer.send(IPC.DEBUG_LOG, 'PRELOAD', 'testApiKey error:', String(err));
      throw err;
    });
  },

  // Recording
  sendRecordingData: (data: { audioBuffer: ArrayBuffer; duration: number }) => {
    return ipcRenderer.invoke(IPC.RECORDING_DATA, data);
  },

  cancelRecording: () => {
    ipcRenderer.send(IPC.RECORDING_CANCEL);
  },

  onRecordingStart: (callback: (data: { mode: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { mode: string }) => callback(data);
    ipcRenderer.on(IPC.RECORDING_START, handler);
    return () => ipcRenderer.removeListener(IPC.RECORDING_START, handler);
  },

  onRecordingStop: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.RECORDING_STOP, handler);
    return () => ipcRenderer.removeListener(IPC.RECORDING_STOP, handler);
  },

  onRecordingCancel: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.RECORDING_CANCEL, handler);
    return () => ipcRenderer.removeListener(IPC.RECORDING_CANCEL, handler);
  },

  notifyPause: () => {
    ipcRenderer.send(IPC.RECORDING_PAUSE);
  },

  notifyResume: () => {
    ipcRenderer.send(IPC.RECORDING_RESUME);
  },

  // Cost
  resetCost: () => {
    return ipcRenderer.invoke(IPC.COST_RESET);
  },

  // Transcripts
  openTranscriptsFolder: () => {
    return ipcRenderer.invoke(IPC.TRANSCRIPTS_OPEN_FOLDER);
  },

  // Audio
  openAudioFolder: () => {
    return ipcRenderer.invoke(IPC.AUDIO_OPEN_FOLDER);
  },

  // Window
  closeWindow: () => {
    ipcRenderer.send(IPC.WINDOW_CLOSE);
  },

  showSettings: () => {
    ipcRenderer.send(IPC.DEBUG_LOG, 'PRELOAD', 'showSettings called');
    ipcRenderer.send(IPC.DEBUG_LOG, 'PRELOAD', 'Sending IPC:', IPC.WINDOW_SHOW_SETTINGS);
    ipcRenderer.send(IPC.WINDOW_SHOW_SETTINGS);
    ipcRenderer.send(IPC.DEBUG_LOG, 'PRELOAD', 'IPC sent');
  },

  setMiniView: (mini: boolean) => {
    ipcRenderer.send(IPC.WINDOW_SET_MINI, mini);
  },

  // Theme
  setTheme: (theme: string) => {
    ipcRenderer.send(IPC.THEME_CHANGED, theme);
  },

  onThemeChanged: (callback: (theme: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: string) => callback(theme);
    ipcRenderer.on(IPC.THEME_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler);
  },

  // Debug logging
  debugLog: (tag: string, ...args: unknown[]) => {
    ipcRenderer.send(IPC.DEBUG_LOG, tag, ...args);
  },

  // Hotkey pause/resume (for settings hotkey capture)
  pauseHotkeys: () => {
    ipcRenderer.send(IPC.HOTKEYS_PAUSE);
  },

  resumeHotkeys: () => {
    ipcRenderer.send(IPC.HOTKEYS_RESUME);
  },

  // Error details
  showErrorDetails: (rawError: string) => {
    ipcRenderer.send(IPC.ERROR_SHOW_DETAILS, rawError);
  },

  onErrorData: (callback: (data: { rawError: string; theme: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { rawError: string; theme: string }) => callback(data);
    ipcRenderer.on(IPC.ERROR_DATA, handler);
    return () => ipcRenderer.removeListener(IPC.ERROR_DATA, handler);
  },
});
