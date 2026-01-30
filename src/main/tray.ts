import { Tray, Menu, nativeImage, app, NativeImage } from 'electron';
import * as path from 'path';
import { TrayState } from '../shared/types';
import { settingsManager } from './settings';
import { log } from './logger';

class TrayManager {
  private tray: Tray | null = null;
  private currentState: TrayState = 'idle';
  private onStartRecording: (() => void) | null = null;
  private onShowSettings: (() => void) | null = null;
  private onToggleWindow: (() => void) | null = null;

  private icons: Record<TrayState, string> = {
    idle: 'tray-idle.png',
    recording: 'tray-recording.png',
    paused: 'tray-paused.png',
    transcribing: 'tray-transcribing.png',
    error: 'tray-error.png',
  };

  private tooltips: Record<TrayState, string> = {
    idle: 'Superduper Whisper - Ready',
    recording: 'Recording...',
    paused: 'Paused (silence detected)',
    transcribing: 'Transcribing...',
    error: 'Error - Click for details',
  };

  initialize(
    onStartRecording: () => void,
    onShowSettings: () => void,
    onToggleWindow: () => void
  ): void {
    log('TRAY', 'initialize called');
    this.onStartRecording = onStartRecording;
    this.onShowSettings = onShowSettings;
    this.onToggleWindow = onToggleWindow;

    // Create tray icon
    const iconPath = this.getIconPath('idle');
    log('TRAY', 'Creating initial icon...');
    const icon = this.createIcon(iconPath);
    log('TRAY', 'Creating Tray with icon...');
    this.tray = new Tray(icon);
    log('TRAY', 'Tray created');

    this.tray.setToolTip(this.tooltips.idle);
    this.updateContextMenu();

    // Single-click to show/hide main window
    this.tray.on('click', () => {
      log('TRAY', 'Single click detected');
      if (this.onToggleWindow) {
        this.onToggleWindow();
      }
    });
  }

  private getIconPath(state: TrayState): string {
    // In development, icons are in assets folder
    // In production, they're in resources
    const isDev = !app.isPackaged;
    const basePath = isDev
      ? path.join(__dirname, '..', '..', 'assets', 'icons')
      : path.join(process.resourcesPath, 'assets', 'icons');

    return path.join(basePath, this.icons[state]);
  }

  private createIcon(iconPath: string): NativeImage {
    log('TRAY', 'createIcon called, path:', iconPath);
    try {
      const icon = nativeImage.createFromPath(iconPath);
      log('TRAY', 'Icon loaded - isEmpty:', icon.isEmpty(), 'size:', icon.getSize());
      if (!icon.isEmpty()) {
        // On macOS, mark as template image so it adapts to menu bar theme
        if (process.platform === 'darwin') {
          icon.setTemplateImage(true);
          log('TRAY', 'Set as template image for macOS');
        }
        return icon;
      }
    } catch (error) {
      log('TRAY', 'Failed to load icon from path:', error);
    }

    // Return empty image as fallback
    log('TRAY', 'Returning empty fallback icon');
    return nativeImage.createEmpty();
  }

  private updateContextMenu(): void {
    if (!this.tray) return;

    const isRecording = this.currentState === 'recording';

    const contextMenu = Menu.buildFromTemplate([
      {
        label: isRecording ? 'Stop Recording' : 'Start Recording',
        click: () => {
          if (this.onStartRecording) {
            this.onStartRecording();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          if (this.onShowSettings) {
            this.onShowSettings();
          }
        },
      },
      {
        label: 'Reset Windows',
        click: () => {
          settingsManager.resetWindowBounds();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  setState(state: TrayState, customTooltip?: string): void {
    log('TRAY', 'setState called, state:', state, 'tray exists:', !!this.tray);
    if (!this.tray) return;

    this.currentState = state;

    // Update icon
    const iconPath = this.getIconPath(state);
    const icon = this.createIcon(iconPath);
    log('TRAY', 'Setting tray image...');
    this.tray.setImage(icon);
    log('TRAY', 'Tray image set');

    // Update tooltip
    this.tray.setToolTip(customTooltip || this.tooltips[state]);

    // Update context menu
    this.updateContextMenu();
  }

  destroy(): void {
    log('TRAY', 'destroy() called, tray exists:', !!this.tray);
    if (this.tray) {
      log('TRAY', 'Calling tray.destroy()...');
      this.tray.destroy();
      log('TRAY', 'tray.destroy() complete');
      this.tray = null;
    }
    log('TRAY', 'destroy() complete');
  }
}

export const trayManager = new TrayManager();
