import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { trayManager } from './tray';
import { hotkeyManager } from './hotkeys';
import { settingsManager } from './settings';
import { setupIPC } from './ipc';
import { IPC_CHANNELS, WindowBounds } from '../shared/types';
import { log } from './logger';

// Read GPU acceleration setting early, before app.ready()
// Must be done synchronously before settingsManager is initialized
function getGpuAccelerationSetting(): boolean {
  try {
    let configDir: string;
    switch (process.platform) {
      case 'darwin':
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'superduper-whisper');
        break;
      case 'win32':
        configDir = path.join(process.env.APPDATA || os.homedir(), 'superduper-whisper');
        break;
      default:
        configDir = path.join(os.homedir(), '.config', 'superduper-whisper');
    }
    const settingsPath = path.join(configDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(data);
      // Default to true if not set
      return settings.gpuAcceleration !== false;
    }
  } catch (error) {
    // Ignore errors, default to enabled
  }
  return true;
}

// Disable hardware acceleration if --no-gpu flag is passed or setting is disabled
const gpuEnabled = getGpuAccelerationSetting();
if (process.argv.includes('--no-gpu') || !gpuEnabled) {
  const reason = process.argv.includes('--no-gpu') ? '--no-gpu flag' : 'settings';
  log('MAIN', `Disabling hardware acceleration (${reason})`);
  app.disableHardwareAcceleration();
}

// Debounce helper for saving window bounds
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: NodeJS.Timeout | null = null;
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

// Keep references to windows
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let errorDetailsWindow: BrowserWindow | null = null;
let isRecording = false;

// Constrain main window to screen bounds
function constrainMainWindowToScreen(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const bounds = mainWindow.getBounds();

  // Use known dimensions based on mini mode state (getBounds can return stale values during drag)
  const isMini = settingsManager.getAll().mainWindowMini;
  const width = isMini ? 120 : 650;
  const height = 52;

  let newX = bounds.x;
  let newY = bounds.y;

  // Clamp to screen edges
  if (newX < 0) newX = 0;
  if (newY < 0) newY = 0;
  if (newX + width > workArea.width) newX = workArea.width - width;
  if (newY + height > workArea.height) newY = workArea.height - height;

  // Only reposition if needed
  if (newX !== bounds.x || newY !== bounds.y) {
    mainWindow.setPosition(newX, newY);
  }
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  // Show main window if another instance tries to start
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

function createMainWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const settings = settingsManager.getAll();

  // Horizontal bar dimensions (defaults)
  const barWidth = settings.mainWindowMini ? 120 : 650;
  const barHeight = 52;

  // Use saved bounds or default to center-bottom
  const savedBounds = settings.mainWindowBounds;
  const x = savedBounds?.x ?? Math.floor((width - barWidth) / 2);
  const y = savedBounds?.y ?? Math.floor(height - barHeight - 100);

  mainWindow = new BrowserWindow({
    width: barWidth,
    height: barHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    show: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Save bounds when window moves (debounced)
  const saveMainBounds = debounce(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      settingsManager.update({ mainWindowBounds: bounds });
      log('MAIN', 'Saved main window bounds:', bounds);
    }
  }, 500);

  mainWindow.on('move', () => {
    constrainMainWindowToScreen();
    saveMainBounds();
  });
  mainWindow.on('resize', saveMainBounds);

  // Allow the window to receive focus for keyboard events
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Load main window HTML
  const mainPath = path.join(__dirname, '..', '..', 'src', 'renderer', 'overlay', 'index.html');
  log('MAIN', 'Loading main window from:', mainPath);
  mainWindow.loadFile(mainPath);

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log('MAIN', 'Main window failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log('RENDERER-MAIN', `[${level}] ${message} (${sourceId}:${line})`);
  });

  // Quit app when main window is closed
  mainWindow.on('closed', () => {
    console.log('[MAIN] Window closed - scheduling exit');
    setImmediate(() => {
      console.log('[MAIN] Exiting now');
      process.exit(0);
    });
  });

  return mainWindow;
}

function createSettingsWindow(): BrowserWindow {
  log('MAIN', 'createSettingsWindow called');
  log('MAIN', 'Existing settingsWindow:', !!settingsWindow);
  log('MAIN', 'settingsWindow destroyed:', settingsWindow?.isDestroyed());

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    log('MAIN', 'Reusing existing settings window');
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  log('MAIN', 'Creating new settings window');
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 740;
  const winHeight = 740;
  const gap = 20;

  // Calculate position based on main window location
  let x: number;
  let y: number;

  if (mainWindow && !mainWindow.isDestroyed()) {
    const mainBounds = mainWindow.getBounds();
    log('MAIN', 'Main window bounds:', mainBounds);

    // Calculate space available in each direction
    const spaceBelow = workArea.height - (mainBounds.y + mainBounds.height + gap);
    const spaceAbove = mainBounds.y - gap;
    const spaceRight = workArea.width - (mainBounds.x + mainBounds.width + gap);
    const spaceLeft = mainBounds.x - gap;

    // Determine best vertical position (below or above main window)
    if (spaceBelow >= winHeight) {
      // Position below main window
      y = mainBounds.y + mainBounds.height + gap;
    } else if (spaceAbove >= winHeight) {
      // Position above main window
      y = mainBounds.y - winHeight - gap;
    } else {
      // Center vertically, clamped to screen
      y = Math.max(0, Math.min(workArea.height - winHeight, Math.floor((workArea.height - winHeight) / 2)));
    }

    // Determine horizontal position (try to align with main window, then check sides)
    // First, try to left-align with main window
    x = mainBounds.x;

    // Clamp to screen bounds
    if (x + winWidth > workArea.width) {
      x = workArea.width - winWidth;
    }
    if (x < 0) {
      x = 0;
    }

    log('MAIN', 'Calculated settings position:', { x, y, spaceBelow, spaceAbove, spaceRight, spaceLeft });
  } else {
    // Fallback: center on screen
    x = Math.floor((workArea.width - winWidth) / 2);
    y = Math.floor((workArea.height - winHeight) / 2);
    log('MAIN', 'No main window, centering settings window');
  }

  settingsWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    frame: false,
    show: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  settingsWindow.setMenu(null);

  const settingsPath = path.join(__dirname, '..', '..', 'src', 'renderer', 'settings', 'index.html');
  log('MAIN', 'Loading settings HTML from:', settingsPath);
  settingsWindow.loadFile(settingsPath);

  // Log renderer errors
  settingsWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log('RENDERER-SETTINGS', `[${level}] ${message} (${sourceId}:${line})`);
  });

  settingsWindow.once('ready-to-show', () => {
    log('MAIN', 'Settings window ready-to-show, showing window');
    settingsWindow?.show();
  });

  settingsWindow.on('closed', () => {
    log('MAIN', 'Settings window closed');
    settingsWindow = null;
  });

  log('MAIN', 'Settings window created');
  return settingsWindow;
}

function createErrorDetailsWindow(rawError: string): BrowserWindow {
  log('MAIN', 'createErrorDetailsWindow called');

  // Close existing error details window if open
  if (errorDetailsWindow && !errorDetailsWindow.isDestroyed()) {
    errorDetailsWindow.close();
  }

  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 500;
  const winHeight = 400;

  // Calculate position based on main window location
  let x: number;
  let y: number;

  if (mainWindow && !mainWindow.isDestroyed()) {
    const mainBounds = mainWindow.getBounds();
    // Position below main window with a gap
    x = mainBounds.x + Math.floor((mainBounds.width - winWidth) / 2);
    y = mainBounds.y + mainBounds.height + 20;

    // Clamp to screen bounds
    if (x + winWidth > workArea.width) x = workArea.width - winWidth;
    if (x < 0) x = 0;
    if (y + winHeight > workArea.height) y = workArea.height - winHeight;
    if (y < 0) y = 0;
  } else {
    // Fallback: center on screen
    x = Math.floor((workArea.width - winWidth) / 2);
    y = Math.floor((workArea.height - winHeight) / 2);
  }

  // Get current theme from settings
  const settings = settingsManager.getAll();
  const theme = settings.theme || 'dark';

  errorDetailsWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    frame: false,
    show: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  errorDetailsWindow.setMenu(null);

  const errorDetailsPath = path.join(__dirname, '..', '..', 'src', 'renderer', 'error-details', 'index.html');
  log('MAIN', 'Loading error details HTML from:', errorDetailsPath);
  errorDetailsWindow.loadFile(errorDetailsPath);

  // Pass the raw error and theme to the window when it's ready
  errorDetailsWindow.webContents.once('did-finish-load', () => {
    log('MAIN', 'Error details window loaded, sending data');
    errorDetailsWindow?.webContents.send('error:data', { rawError, theme });
  });

  errorDetailsWindow.once('ready-to-show', () => {
    log('MAIN', 'Error details window ready-to-show');
    errorDetailsWindow?.show();
  });

  errorDetailsWindow.on('closed', () => {
    log('MAIN', 'Error details window closed');
    errorDetailsWindow = null;
  });

  log('MAIN', 'Error details window created');
  return errorDetailsWindow;
}

function startRecording(): void {
  log('MAIN', 'startRecording called, isRecording:', isRecording);
  const settings = settingsManager.getAll();

  // Make sure main window is visible
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
  }

  if (!isRecording) {
    // Start recording
    if (!settings.apiKey) {
      log('MAIN', 'No API key, opening settings');
      createSettingsWindow();
      return;
    }

    isRecording = true;
    trayManager.setState('recording');
    log('MAIN', 'Sending RECORDING_START to renderer');
    mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_START);
  }
}

function stopRecording(): void {
  log('MAIN', 'stopRecording called, isRecording:', isRecording);
  if (isRecording) {
    isRecording = false;
    log('MAIN', 'Sending RECORDING_STOP to renderer');
    mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_STOP);
  }
}

function cancelRecording(): void {
  log('MAIN', 'cancelRecording called, isRecording:', isRecording);
  if (isRecording) {
    isRecording = false;
    trayManager.setState('idle');
    log('MAIN', 'Sending RECORDING_CANCEL to renderer');
    mainWindow?.webContents.send(IPC_CHANNELS.RECORDING_CANCEL);
  }
}

function toggleRecording(): void {
  log('MAIN', 'toggleRecording called (from tray), isRecording:', isRecording);
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function toggleMainWindow(): void {
  log('MAIN', 'toggleMainWindow called');
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      log('MAIN', 'Hiding main window');
      mainWindow.hide();
    } else {
      log('MAIN', 'Showing main window');
      mainWindow.show();
    }
  }
}

// App initialization
app.whenReady().then(() => {
  log('MAIN', 'App ready, initializing...');

  // Set up IPC handlers
  log('MAIN', 'Setting up IPC handlers');
  setupIPC(
    () => mainWindow,
    () => settingsWindow,
    createSettingsWindow,
    createErrorDetailsWindow,
    constrainMainWindowToScreen
  );
  log('MAIN', 'IPC handlers set up');

  // Initialize tray
  trayManager.initialize(
    toggleRecording,
    () => createSettingsWindow(),
    toggleMainWindow
  );

  // Register global hotkeys
  hotkeyManager.registerHotkeys(toggleRecording, cancelRecording);

  // Create main window (visible)
  createMainWindow();
});

// Cleanup
app.on('will-quit', () => {
  hotkeyManager.destroy();
  trayManager.destroy();
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});

// macOS specific
app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

// Handle recording state updates
export function setRecordingState(recording: boolean): void {
  isRecording = recording;
  if (!recording) {
    trayManager.setState('idle');
  }
}
