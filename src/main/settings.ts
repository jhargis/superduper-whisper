import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { Settings, DEFAULT_SETTINGS } from '../shared/types';
import { log, logError } from './logger';

class SettingsManager {
  private settings: Settings;
  private settingsPath: string;

  constructor() {
    this.settingsPath = this.getSettingsPath();
    this.settings = this.loadSettings();
  }

  private getSettingsPath(): string {
    let configDir: string;

    switch (process.platform) {
      case 'darwin':
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'superduper-whisper');
        break;
      case 'win32':
        configDir = path.join(process.env.APPDATA || os.homedir(), 'superduper-whisper');
        break;
      default: // Linux and others
        configDir = path.join(os.homedir(), '.config', 'superduper-whisper');
    }

    // Ensure directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    return path.join(configDir, 'settings.json');
  }

  private loadSettings(): Settings {
    log('SETTINGS-MAIN', 'Loading settings from:', this.settingsPath);
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const loadedSettings = JSON.parse(data);
        log('SETTINGS-MAIN', 'Loaded settings, apiKey length:', loadedSettings.apiKey?.length || 0);
        // Merge with defaults to handle new settings added in updates
        return { ...DEFAULT_SETTINGS, ...loadedSettings };
      }
      log('SETTINGS-MAIN', 'Settings file does not exist, using defaults');
    } catch (error) {
      logError('SETTINGS-MAIN', 'Failed to load settings:', error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(): void {
    log('SETTINGS-MAIN', 'Saving settings to:', this.settingsPath);
    log('SETTINGS-MAIN', 'apiKey length:', this.settings.apiKey?.length || 0);
    try {
      const data = JSON.stringify(this.settings, null, 2);
      fs.writeFileSync(this.settingsPath, data, 'utf-8');
      log('SETTINGS-MAIN', 'Settings saved successfully');
    } catch (error) {
      logError('SETTINGS-MAIN', 'Failed to save settings:', error);
    }
  }

  getAll(): Settings {
    return { ...this.settings };
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.settings[key];
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value;
    this.saveSettings();
  }

  update(partialSettings: Partial<Settings>): void {
    this.settings = { ...this.settings, ...partialSettings };
    this.saveSettings();
  }

  addCost(cost: number): void {
    this.settings.totalCost += cost;
    this.saveSettings();
  }

  resetCost(): void {
    this.settings.totalCost = 0;
    this.saveSettings();
  }

  resetWindowBounds(): void {
    log('SETTINGS-MAIN', 'Resetting window bounds');
    delete this.settings.mainWindowBounds;
    delete this.settings.settingsWindowBounds;
    delete this.settings.mainWindowMini;
    this.saveSettings();
  }

  getTranscriptsDir(): string {
    const configDir = path.dirname(this.settingsPath);
    const transcriptsDir = path.join(configDir, 'transcripts');

    // Ensure directory exists
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }

    return transcriptsDir;
  }

  saveTranscript(text: string): string | null {
    if (!this.settings.saveTranscripts || !text.trim()) {
      return null;
    }

    try {
      const transcriptsDir = this.getTranscriptsDir();

      // Generate filename from first 6 words
      const words = text
        .trim()
        .split(/\s+/)
        .slice(0, 6)
        .map(word => word.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
        .filter(word => word.length > 0);

      const basename = words.length > 0 ? words.join('-') : 'transcript';
      const filename = `${basename}.txt`;
      const filepath = path.join(transcriptsDir, filename);

      fs.writeFileSync(filepath, text, 'utf-8');
      log('SETTINGS-MAIN', 'Saved transcript to:', filepath);
      return filepath;
    } catch (error) {
      logError('SETTINGS-MAIN', 'Failed to save transcript:', error);
      return null;
    }
  }

  openTranscriptsFolder(): void {
    const transcriptsDir = this.getTranscriptsDir();
    log('SETTINGS-MAIN', 'Opening transcripts folder:', transcriptsDir);

    let command: string;
    switch (process.platform) {
      case 'darwin':
        command = `open "${transcriptsDir}"`;
        break;
      case 'win32':
        command = `explorer "${transcriptsDir}"`;
        break;
      default: // Linux
        command = `xdg-open "${transcriptsDir}"`;
    }

    exec(command, (error) => {
      if (error) {
        logError('SETTINGS-MAIN', 'Failed to open transcripts folder:', error);
      }
    });
  }

  getAudioDir(): string {
    const configDir = path.dirname(this.settingsPath);
    const audioDir = path.join(configDir, 'audio');

    // Ensure directory exists
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    return audioDir;
  }

  saveAudioFile(audioBuffer: Buffer, transcriptText: string): string | null {
    if (!this.settings.saveAudio) {
      return null;
    }

    try {
      const audioDir = this.getAudioDir();

      // Generate filename from first 6 words of transcript (if available)
      let basename: string;
      if (transcriptText && transcriptText.trim()) {
        const words = transcriptText
          .trim()
          .split(/\s+/)
          .slice(0, 6)
          .map(word => word.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
          .filter(word => word.length > 0);
        basename = words.length > 0 ? words.join('-') : `recording-${Date.now()}`;
      } else {
        basename = `recording-${Date.now()}`;
      }

      const filename = `${basename}.webm`;
      const filepath = path.join(audioDir, filename);

      fs.writeFileSync(filepath, audioBuffer);
      log('SETTINGS-MAIN', 'Saved audio to:', filepath);
      return filepath;
    } catch (error) {
      logError('SETTINGS-MAIN', 'Failed to save audio:', error);
      return null;
    }
  }

  openAudioFolder(): void {
    const audioDir = this.getAudioDir();
    log('SETTINGS-MAIN', 'Opening audio folder:', audioDir);

    let command: string;
    switch (process.platform) {
      case 'darwin':
        command = `open "${audioDir}"`;
        break;
      case 'win32':
        command = `explorer "${audioDir}"`;
        break;
      default: // Linux
        command = `xdg-open "${audioDir}"`;
    }

    exec(command, (error) => {
      if (error) {
        logError('SETTINGS-MAIN', 'Failed to open audio folder:', error);
      }
    });
  }
}

// Export singleton instance
export const settingsManager = new SettingsManager();
