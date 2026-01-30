import { globalShortcut } from 'electron';
import { settingsManager } from './settings';
import { log, logError } from './logger';

type HotkeyCallback = () => void;

class HotkeyManager {
  private callbacks: Map<string, HotkeyCallback> = new Map();
  private registeredShortcuts: string[] = [];
  private paused: boolean = false;

  /**
   * Register global hotkeys based on settings
   */
  registerHotkeys(
    onToggle: HotkeyCallback,
    onCancel: HotkeyCallback
  ): void {
    log('HOTKEYS', 'registerHotkeys called');
    this.callbacks.set('record', onToggle);
    this.callbacks.set('cancel', onCancel);

    this.updateHotkeys();
  }

  /**
   * Update hotkey registrations when settings change
   */
  updateHotkeys(): void {
    log('HOTKEYS', 'updateHotkeys called');
    // Don't register if paused
    if (this.paused) {
      log('HOTKEYS', 'Hotkeys paused, skipping registration');
      return;
    }
    // Unregister all existing shortcuts
    this.unregisterAll();

    const settings = settingsManager.getAll();
    log('HOTKEYS', 'Settings:', { recordHotkey: settings.recordHotkey, cancelHotkey: settings.cancelHotkey });

    // Register record toggle hotkey
    this.registerHotkey('record', settings.recordHotkey);

    // Register cancel hotkey
    this.registerHotkey('cancel', settings.cancelHotkey);
  }

  private registerHotkey(name: string, accelerator: string): void {
    const callback = this.callbacks.get(name);
    if (!callback || !accelerator) {
      log('HOTKEYS', `Skipping ${name} hotkey: callback=${!!callback}, accelerator=${accelerator}`);
      return;
    }

    try {
      const registered = globalShortcut.register(accelerator, callback);
      if (registered) {
        this.registeredShortcuts.push(accelerator);
        log('HOTKEYS', `Registered ${name} hotkey: ${accelerator}`);
      } else {
        logError('HOTKEYS', `Failed to register ${name} hotkey: ${accelerator}`);
      }
    } catch (error) {
      logError('HOTKEYS', `Error registering ${name} hotkey:`, error);
    }
  }

  /**
   * Unregister all hotkeys
   */
  unregisterAll(): void {
    for (const shortcut of this.registeredShortcuts) {
      try {
        globalShortcut.unregister(shortcut);
      } catch (error) {
        console.error(`Error unregistering shortcut ${shortcut}:`, error);
      }
    }
    this.registeredShortcuts = [];
  }

  /**
   * Temporarily pause hotkeys (e.g., while capturing new hotkey in settings)
   */
  pause(): void {
    if (this.paused) {
      log('HOTKEYS', 'Already paused, skipping');
      return;
    }
    log('HOTKEYS', 'Pausing hotkeys');
    this.paused = true;
    this.unregisterAll();
  }

  /**
   * Resume hotkeys after pausing
   */
  resume(): void {
    if (!this.paused) {
      log('HOTKEYS', 'Not paused, skipping resume');
      return;
    }
    log('HOTKEYS', 'Resuming hotkeys');
    this.paused = false;
    this.updateHotkeys();
  }

  /**
   * Check if a hotkey is currently registered
   */
  isRegistered(accelerator: string): boolean {
    return globalShortcut.isRegistered(accelerator);
  }

  /**
   * Validate that a hotkey accelerator is valid
   */
  validateAccelerator(accelerator: string): boolean {
    // Try to register and immediately unregister to validate
    try {
      const registered = globalShortcut.register(accelerator, () => {});
      if (registered) {
        globalShortcut.unregister(accelerator);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Clean up on app quit
   */
  destroy(): void {
    log('HOTKEYS', 'destroy() called');
    this.unregisterAll();
    log('HOTKEYS', 'unregisterAll() complete');
    globalShortcut.unregisterAll();
    log('HOTKEYS', 'globalShortcut.unregisterAll() complete');
  }
}

export const hotkeyManager = new HotkeyManager();
