import { ipcMain, clipboard, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { settingsManager } from './settings';
import { transcribeAudio, testApiKey, calculateCost } from './whisper';
import { trayManager } from './tray';
import { hotkeyManager } from './hotkeys';
import { IPC_CHANNELS, TranscriptionResult, Settings } from '../shared/types';
import { log, logError } from './logger';

/**
 * Auto-paste text using platform-specific tools
 * Linux: xdotool
 * macOS: osascript
 * Windows: PowerShell
 */
async function autoPaste(): Promise<void> {
  return new Promise((resolve) => {
    let command: string;

    switch (process.platform) {
      case 'linux':
        // Use xdotool to simulate Shift+Insert (works in terminals)
        // Small delay to ensure clipboard is ready
        command = 'sleep 0.1 && xdotool key --clearmodifiers shift+Insert';
        break;
      case 'darwin':
        // Use osascript on macOS
        command = 'osascript -e \'tell application "System Events" to keystroke "v" using command down\'';
        break;
      case 'win32':
        // Use PowerShell on Windows
        command = 'powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"';
        break;
      default:
        resolve();
        return;
    }

    exec(command, (error) => {
      if (error) {
        console.error('Auto-paste failed:', error);
      }
      resolve();
    });
  });
}

export function setupIPC(
  getMainWindow: () => BrowserWindow | null,
  getSettingsWindow: () => BrowserWindow | null,
  createSettingsWindow: () => BrowserWindow,
  createErrorDetailsWindow: (rawError: string) => BrowserWindow,
  constrainMainWindow: () => void
): void {
  log('IPC', 'setupIPC called');
  log('IPC', 'getMainWindow:', typeof getMainWindow);
  log('IPC', 'getSettingsWindow:', typeof getSettingsWindow);
  log('IPC', 'createSettingsWindow:', typeof createSettingsWindow);
  log('IPC', 'createErrorDetailsWindow:', typeof createErrorDetailsWindow);

  // Settings handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    log('IPC', 'SETTINGS_GET handler called');
    return settingsManager.getAll();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, newSettings: Partial<Settings>) => {
    log('IPC', 'SETTINGS_UPDATE handler called', newSettings);
    const oldSettings = settingsManager.getAll();

    // If API key changed, reset validation status
    if (newSettings.apiKey !== undefined && newSettings.apiKey !== oldSettings.apiKey) {
      log('IPC', 'API key changed, resetting validation status');
      newSettings.apiKeyValid = false;
    }

    settingsManager.update(newSettings);

    // If any hotkey changed, re-register all hotkeys
    const hotkeyChanged =
      (newSettings.recordHotkey && newSettings.recordHotkey !== oldSettings.recordHotkey) ||
      (newSettings.cancelHotkey && newSettings.cancelHotkey !== oldSettings.cancelHotkey);

    if (hotkeyChanged) {
      log('IPC', 'Hotkey changed, re-registering hotkeys');
      hotkeyManager.updateHotkeys();
    }

    // Broadcast settings change to all windows
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settingsManager.getAll());
    }

    return { success: true };
  });

  // API key test
  ipcMain.handle(IPC_CHANNELS.API_TEST, async (_event, apiKey: string) => {
    log('IPC', 'API_TEST handler called');
    log('IPC', 'API key length:', apiKey?.length || 0);
    log('IPC', 'API key prefix:', apiKey?.substring(0, 7) || 'empty');
    try {
      log('IPC', 'Calling testApiKey...');
      const result = await testApiKey(apiKey);
      log('IPC', 'testApiKey returned:', result);

      // Update apiKeyValid based on test result
      if (result.valid) {
        log('IPC', 'API key valid, updating apiKeyValid to true');
        settingsManager.update({ apiKeyValid: true });
        // Broadcast settings change to all windows
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settingsManager.getAll());
        }
      }

      return result;
    } catch (error) {
      logError('IPC', 'testApiKey threw error:', error);
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Recording data handler - receives audio and transcribes
  ipcMain.handle(IPC_CHANNELS.RECORDING_DATA, async (_event, data: { audioBuffer: ArrayBuffer; duration: number }) => {
    const settings = settingsManager.getAll();

    if (!settings.apiKey) {
      return { error: 'No API key configured' } as TranscriptionResult;
    }

    trayManager.setState('transcribing');

    try {
      const audioData = Buffer.from(data.audioBuffer);
      const filename = `recording-${Date.now()}.webm`;

      const result = await transcribeAudio(audioData, filename, settings.apiKey);

      if (result.error) {
        trayManager.setState('idle');
        return {
          text: '',
          duration: data.duration,
          cost: 0,
          error: result.error,
          rawError: result.rawError,
        } as TranscriptionResult;
      }

      // Calculate and track cost
      const cost = calculateCost(data.duration);
      settingsManager.addCost(cost);

      // Copy to clipboard if enabled
      if (settings.copyToClipboard && result.text) {
        clipboard.writeText(result.text);
      }

      // Auto-paste if enabled
      if (settings.autoPaste && result.text) {
        await autoPaste();
      }

      // Save transcript if enabled
      if (result.text) {
        settingsManager.saveTranscript(result.text);
      }

      // Save audio if enabled
      settingsManager.saveAudioFile(audioData, result.text || '');

      trayManager.setState('idle');

      return {
        text: result.text,
        duration: data.duration,
        cost,
      } as TranscriptionResult;
    } catch (error) {
      trayManager.setState('idle');
      return {
        text: '',
        duration: data.duration,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      } as TranscriptionResult;
    }
  });

  // Cost reset
  ipcMain.handle(IPC_CHANNELS.COST_RESET, () => {
    settingsManager.resetCost();
    return { success: true };
  });

  // Open transcripts folder
  ipcMain.handle(IPC_CHANNELS.TRANSCRIPTS_OPEN_FOLDER, () => {
    settingsManager.openTranscriptsFolder();
    return { success: true };
  });

  // Open audio folder
  ipcMain.handle(IPC_CHANNELS.AUDIO_OPEN_FOLDER, () => {
    settingsManager.openAudioFolder();
    return { success: true };
  });

  // Window controls
  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.hide();
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_SHOW_SETTINGS, () => {
    log('IPC', 'WINDOW_SHOW_SETTINGS handler called');
    const settingsWin = getSettingsWindow();
    log('IPC', 'Settings window exists:', !!settingsWin);
    log('IPC', 'Settings window destroyed:', settingsWin?.isDestroyed());
    if (settingsWin && !settingsWin.isDestroyed()) {
      const isVisible = settingsWin.isVisible();
      log('IPC', 'Settings window visible:', isVisible);
      if (isVisible) {
        log('IPC', 'Closing settings window (freeing memory)');
        settingsWin.close();
      } else {
        log('IPC', 'Showing and focusing settings window');
        settingsWin.show();
        settingsWin.focus();
      }
    } else {
      log('IPC', 'Creating new settings window');
      createSettingsWindow();
    }
  });

  // Recording cancel
  ipcMain.on(IPC_CHANNELS.RECORDING_CANCEL, () => {
    trayManager.setState('idle');
  });

  // Recording pause/resume
  ipcMain.on(IPC_CHANNELS.RECORDING_PAUSE, () => {
    log('IPC', 'Recording paused');
    trayManager.setState('paused');
  });

  ipcMain.on(IPC_CHANNELS.RECORDING_RESUME, () => {
    log('IPC', 'Recording resumed');
    trayManager.setState('recording');
  });

  // Mini view toggle
  ipcMain.on(IPC_CHANNELS.WINDOW_SET_MINI, (event, mini: boolean) => {
    log('IPC', 'WINDOW_SET_MINI handler called, mini:', mini);
    // Persist mini state first (constrainMainWindow reads this)
    settingsManager.update({ mainWindowMini: mini });
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mini) {
        mainWindow.setSize(120, 52);
      } else {
        mainWindow.setSize(650, 52);
        // Constrain to screen bounds after expanding
        constrainMainWindow();
      }
    }
  });

  // Theme changed - broadcast to all windows immediately
  ipcMain.on(IPC_CHANNELS.THEME_CHANGED, (_event, theme: string) => {
    log('IPC', 'THEME_CHANGED handler called, theme:', theme);
    // Persist theme to settings
    settingsManager.update({ theme: theme as Settings['theme'] });
    // Broadcast to all windows for immediate update
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(IPC_CHANNELS.THEME_CHANGED, theme);
    }
  });

  // Debug logging from renderer
  ipcMain.on(IPC_CHANNELS.DEBUG_LOG, (_event, tag: string, ...args: unknown[]) => {
    log(tag, ...args);
  });

  // Hotkey pause/resume (for settings hotkey capture)
  ipcMain.on(IPC_CHANNELS.HOTKEYS_PAUSE, () => {
    log('IPC', 'HOTKEYS_PAUSE handler called');
    hotkeyManager.pause();
  });

  ipcMain.on(IPC_CHANNELS.HOTKEYS_RESUME, () => {
    log('IPC', 'HOTKEYS_RESUME handler called');
    hotkeyManager.resume();
  });

  // Error details
  ipcMain.on(IPC_CHANNELS.ERROR_SHOW_DETAILS, (_event, rawError: string) => {
    log('IPC', 'ERROR_SHOW_DETAILS handler called');
    createErrorDetailsWindow(rawError);
  });
}
