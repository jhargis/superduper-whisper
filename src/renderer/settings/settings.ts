// Settings Window Logic - Condensed UI

(function() {
// Helper for debug logging to file
const log = (tag: string, ...args: unknown[]) => {
  (window as any).electronAPI?.debugLog(tag, ...args);
  console.log(`[${tag}]`, ...args);
};

log('SETTINGS', 'Settings script loading...');

type ThemeName = 'dark' | 'light' | 'dracula' | 'nord' | 'retro' | 'monokai' | 'synthwave' | 'forest' | 'onedark' | 'gruvbox' | 'sunset' | 'catppuccin';
const ALL_THEMES: ThemeName[] = ['dark', 'light', 'dracula', 'nord', 'retro', 'monokai', 'synthwave', 'forest', 'onedark', 'gruvbox', 'sunset', 'catppuccin'];

interface FormSettings {
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
}

// DOM Elements
const closeBtn = document.getElementById('closeBtn') as HTMLButtonElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const toggleApiKeyBtn = document.getElementById('toggleApiKey') as HTMLButtonElement;
const testApiKeyBtn = document.getElementById('testApiKey') as HTMLButtonElement;
const apiStatus = document.getElementById('apiStatus')!;

// Hotkey elements
const hotkeyRecordInput = document.getElementById('hotkeyRecord') as HTMLInputElement;
const hotkeyCancelInput = document.getElementById('hotkeyCancel') as HTMLInputElement;
const currentRecordHotkeySpan = document.getElementById('currentRecordHotkey')!;
const currentCancelHotkeySpan = document.getElementById('currentCancelHotkey')!;

const microphoneSelect = document.getElementById('microphoneId') as HTMLSelectElement;
const bitrateSelect = document.getElementById('bitrate') as HTMLSelectElement;
const sampleRateSelect = document.getElementById('sampleRate') as HTMLSelectElement;
const channelCountSelect = document.getElementById('channelCount') as HTMLSelectElement;
const echoCancellationCheckbox = document.getElementById('echoCancellation') as HTMLInputElement;
const noiseSuppressionCheckbox = document.getElementById('noiseSuppression') as HTMLInputElement;
const autoGainControlCheckbox = document.getElementById('autoGainControl') as HTMLInputElement;
const silenceDetectionCheckbox = document.getElementById('silenceDetection') as HTMLInputElement;
const silenceSettings = document.getElementById('silenceSettings')!;
const silenceThresholdSlider = document.getElementById('silenceThreshold') as HTMLInputElement;
const silenceThresholdValue = document.getElementById('silenceThresholdValue')!;
const pauseDelayInput = document.getElementById('pauseDelay') as HTMLInputElement;
const copyToClipboardCheckbox = document.getElementById('copyToClipboard') as HTMLInputElement;
const autoPasteCheckbox = document.getElementById('autoPaste') as HTMLInputElement;
const playSoundCheckbox = document.getElementById('playSound') as HTMLInputElement;
const saveTranscriptsCheckbox = document.getElementById('saveTranscripts') as HTMLInputElement;
const saveAudioCheckbox = document.getElementById('saveAudio') as HTMLInputElement;
const gpuAccelerationCheckbox = document.getElementById('gpuAcceleration') as HTMLInputElement;
const openTranscriptsFolderBtn = document.getElementById('openTranscriptsFolder') as HTMLButtonElement;
const openAudioFolderBtn = document.getElementById('openAudioFolder') as HTMLButtonElement;
const totalCostInput = document.getElementById('totalCost') as HTMLInputElement;
const resetCostBtn = document.getElementById('resetCost') as HTMLButtonElement;
const themeGrid = document.getElementById('themeGrid')!;

let originalSettings: FormSettings;
let currentTheme: ThemeName = 'dark';

// Apply theme to document
function applyTheme(theme: ThemeName) {
  log('SETTINGS', 'applyTheme called:', theme);
  const root = document.documentElement;
  // Remove all theme classes
  ALL_THEMES.forEach(t => root.classList.remove(t));
  // Add the new theme class
  root.classList.add(theme);
  currentTheme = theme;
  // Update active state on theme options
  themeGrid.querySelectorAll('.theme-option').forEach(option => {
    const optionTheme = (option as HTMLElement).dataset.theme;
    option.classList.toggle('active', optionTheme === theme);
    const radio = option.querySelector('input[type="radio"]') as HTMLInputElement;
    if (radio) radio.checked = optionTheme === theme;
  });
}
let activeHotkeyInput: HTMLInputElement | null = null;
let activeHotkeySpan: HTMLElement | null = null;
let activeHotkeyKey: string | null = null;

// Track modifier state manually (needed because event.metaKey etc. are false when pressing the modifier itself)
const heldModifiers = {
  ctrl: false,
  meta: false,
  alt: false,
  shift: false,
};

// Timeout for delayed blur handling (prevents DE focus stealing from cancelling capture)
let blurTimeout: ReturnType<typeof setTimeout> | null = null;

// Enumerate audio input devices and populate dropdown
async function populateMicrophoneList(selectedId: string = '') {
  log('SETTINGS', 'populateMicrophoneList called, selectedId:', selectedId);
  try {
    // Request mic permission first to get device labels
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    log('SETTINGS', 'Found audio input devices:', audioInputs.length);

    // Clear existing options except "Default"
    microphoneSelect.innerHTML = '<option value="">Default</option>';

    audioInputs.forEach(device => {
      // Skip the system default device since we already have our own Default option
      if (device.deviceId === 'default') return;

      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
      if (device.deviceId === selectedId) {
        option.selected = true;
      }
      microphoneSelect.appendChild(option);
      log('SETTINGS', 'Added microphone:', device.label, device.deviceId);
    });
  } catch (error) {
    log('SETTINGS', 'Failed to enumerate audio devices:', error);
  }
}

// Load settings
async function loadSettings() {
  log('SETTINGS', 'loadSettings called');
  try {
    const settings = await (window as any).electronAPI.getSettings() as FormSettings;
    log('SETTINGS', 'Loaded settings:', JSON.stringify(settings));
    originalSettings = { ...settings };
    await populateMicrophoneList(settings.microphoneId || '');
    populateForm(settings);
  } catch (error) {
    log('SETTINGS', 'Failed to load settings:', error);
  }
}

// Populate form
function populateForm(settings: FormSettings) {
  log('SETTINGS', 'populateForm called');
  apiKeyInput.value = settings.apiKey || '';

  // Show API key validation status
  if (settings.apiKey) {
    if (settings.apiKeyValid) {
      apiStatus.textContent = '✓ Valid';
      apiStatus.className = 'status-msg success';
    } else {
      apiStatus.textContent = 'Not validated';
      apiStatus.className = 'status-msg warning';
    }
  } else {
    apiStatus.textContent = '';
    apiStatus.className = 'status-msg';
  }

  // Hotkeys
  currentRecordHotkeySpan.textContent = settings.recordHotkey || 'Not set';
  currentCancelHotkeySpan.textContent = settings.cancelHotkey || 'Not set';

  microphoneSelect.value = settings.microphoneId || '';
  bitrateSelect.value = settings.bitrate.toString();
  sampleRateSelect.value = settings.sampleRate.toString();
  channelCountSelect.value = settings.channelCount.toString();

  echoCancellationCheckbox.checked = settings.echoCancellation;
  noiseSuppressionCheckbox.checked = settings.noiseSuppression;
  autoGainControlCheckbox.checked = settings.autoGainControl;

  silenceDetectionCheckbox.checked = settings.silenceDetection;
  updateSilenceSettingsState();
  silenceThresholdSlider.value = settings.silenceThreshold.toString();
  silenceThresholdValue.textContent = settings.silenceThreshold.toString();
  pauseDelayInput.value = (settings.pauseDelay / 1000).toString();

  copyToClipboardCheckbox.checked = settings.copyToClipboard;
  autoPasteCheckbox.checked = settings.autoPaste;
  playSoundCheckbox.checked = settings.playSound;
  saveTranscriptsCheckbox.checked = settings.saveTranscripts;
  saveAudioCheckbox.checked = settings.saveAudio;
  gpuAccelerationCheckbox.checked = settings.gpuAcceleration !== false;

  totalCostInput.value = settings.totalCost.toFixed(4);

  // Apply theme
  applyTheme(settings.theme || 'dark');

  // Check for hotkey conflicts
  updateHotkeyConflictState();
}

// Get form values
function getFormValues(): Partial<FormSettings> {
  return {
    apiKey: apiKeyInput.value,
    recordHotkey: currentRecordHotkeySpan.textContent || originalSettings.recordHotkey,
    cancelHotkey: currentCancelHotkeySpan.textContent || originalSettings.cancelHotkey,
    microphoneId: microphoneSelect.value,
    bitrate: parseInt(bitrateSelect.value),
    sampleRate: parseInt(sampleRateSelect.value),
    channelCount: parseInt(channelCountSelect.value),
    echoCancellation: echoCancellationCheckbox.checked,
    noiseSuppression: noiseSuppressionCheckbox.checked,
    autoGainControl: autoGainControlCheckbox.checked,
    silenceDetection: silenceDetectionCheckbox.checked,
    silenceThreshold: parseInt(silenceThresholdSlider.value),
    pauseDelay: parseFloat(pauseDelayInput.value) * 1000,
    copyToClipboard: copyToClipboardCheckbox.checked,
    autoPaste: autoPasteCheckbox.checked,
    playSound: playSoundCheckbox.checked,
    saveTranscripts: saveTranscriptsCheckbox.checked,
    saveAudio: saveAudioCheckbox.checked,
    totalCost: parseFloat(totalCostInput.value) || 0,
    theme: currentTheme,
    gpuAcceleration: gpuAccelerationCheckbox.checked,
  };
}

// Save settings (called automatically on change)
async function saveSettings() {
  log('SETTINGS', 'saveSettings called');
  const values = getFormValues();
  log('SETTINGS', 'Form values:', JSON.stringify(values));
  try {
    await (window as any).electronAPI.updateSettings(values);
    log('SETTINGS', 'Settings saved successfully');
    originalSettings = { ...originalSettings, ...values } as FormSettings;
  } catch (error) {
    log('SETTINGS', 'Failed to save settings:', error);
  }
}

// Test API key
async function testApiKey() {
  log('SETTINGS', 'testApiKey function called');
  const apiKey = apiKeyInput.value.trim();
  log('SETTINGS', 'API key length:', apiKey?.length || 0);

  if (!apiKey) {
    log('SETTINGS', 'No API key entered');
    apiStatus.textContent = 'Enter an API key';
    apiStatus.className = 'status-msg error';
    return;
  }

  log('SETTINGS', 'Setting status to Testing...');
  apiStatus.textContent = 'Testing...';
  apiStatus.className = 'status-msg loading';
  testApiKeyBtn.disabled = true;

  try {
    log('SETTINGS', 'Calling electronAPI.testApiKey()');
    const result = await (window as any).electronAPI.testApiKey(apiKey);
    log('SETTINGS', 'testApiKey result:', JSON.stringify(result));
    if (result.valid) {
      log('SETTINGS', 'API key is valid');
      apiStatus.textContent = '✓ Valid';
      apiStatus.className = 'status-msg success';
    } else {
      log('SETTINGS', 'API key is invalid:', result.error);
      apiStatus.textContent = `✗ ${result.error || 'Invalid'}`;
      apiStatus.className = 'status-msg error';
    }
  } catch (error) {
    log('SETTINGS', 'testApiKey threw error:', error);
    apiStatus.textContent = '✗ Test failed';
    apiStatus.className = 'status-msg error';
  } finally {
    log('SETTINGS', 'Re-enabling test button');
    testApiKeyBtn.disabled = false;
  }
}

// Toggle API key visibility
function toggleApiKeyVisibility() {
  log('SETTINGS', 'toggleApiKeyVisibility called');
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
}

// Update silence settings state
function updateSilenceSettingsState() {
  silenceSettings.classList.toggle('disabled', !silenceDetectionCheckbox.checked);
}

// Check for hotkey conflicts and update UI
function updateHotkeyConflictState() {
  const recordHotkey = currentRecordHotkeySpan.textContent?.trim() || '';
  const cancelHotkey = currentCancelHotkeySpan.textContent?.trim() || '';

  // Check if both are set and match (case-insensitive)
  const hasConflict = !!(recordHotkey && cancelHotkey &&
    recordHotkey.toLowerCase() === cancelHotkey.toLowerCase() &&
    recordHotkey !== 'Not set' && cancelHotkey !== 'Not set');

  log('SETTINGS', 'Checking hotkey conflict:', { recordHotkey, cancelHotkey, hasConflict });

  currentRecordHotkeySpan.classList.toggle('conflict', hasConflict);
  currentCancelHotkeySpan.classList.toggle('conflict', hasConflict);
}

// Hotkey capture
function startHotkeyCapture(input: HTMLInputElement, span: HTMLElement, key: string) {
  log('SETTINGS', 'startHotkeyCapture called for:', key);
  log('SETTINGS', 'input element:', input ? 'found' : 'NOT FOUND');
  log('SETTINGS', 'span element:', span ? 'found' : 'NOT FOUND');

  // Clear any previous capture
  if (activeHotkeyInput && activeHotkeyInput !== input) {
    activeHotkeyInput.value = '';
    activeHotkeyInput.classList.remove('capturing');
  }

  // Pause global hotkeys while capturing
  log('SETTINGS', 'Pausing global hotkeys');
  (window as any).electronAPI?.pauseHotkeys();

  activeHotkeyInput = input;
  activeHotkeySpan = span;
  activeHotkeyKey = key;
  input.value = 'Press keys...';
  input.classList.add('capturing');
  log('SETTINGS', 'Now capturing hotkey for:', key);
}

function stopHotkeyCapture() {
  log('SETTINGS', 'stopHotkeyCapture called');
  const wasCapturing = activeHotkeyInput !== null;
  if (activeHotkeyInput) {
    activeHotkeyInput.value = '';
    activeHotkeyInput.classList.remove('capturing');
  }
  activeHotkeyInput = null;
  activeHotkeySpan = null;
  activeHotkeyKey = null;
  resetHeldModifiers();

  // Resume global hotkeys
  log('SETTINGS', 'Resuming global hotkeys');
  (window as any).electronAPI?.resumeHotkeys();

  // Save settings if we were capturing (hotkey may have changed)
  if (wasCapturing) {
    saveSettings();
    updateHotkeyConflictState();
  }
}

function buildAccelerator(key: string): string {
  log('SETTINGS', 'buildAccelerator called with key:', key);
  log('SETTINGS', 'heldModifiers:', JSON.stringify(heldModifiers));

  const parts: string[] = [];
  if (heldModifiers.ctrl) parts.push('Control');
  if (heldModifiers.meta) parts.push('Meta');
  if (heldModifiers.alt) parts.push('Alt');
  if (heldModifiers.shift) parts.push('Shift');

  // Normalize key names
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';

  parts.push(key);

  const result = parts.join('+');
  log('SETTINGS', 'Accelerator result:', result);
  return result;
}

function resetHeldModifiers(): void {
  heldModifiers.ctrl = false;
  heldModifiers.meta = false;
  heldModifiers.alt = false;
  heldModifiers.shift = false;
}

function isModifierKey(key: string): boolean {
  return ['Control', 'Meta', 'Alt', 'Shift'].includes(key);
}

function isFunctionKey(key: string): boolean {
  return /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
}

function handleHotkeyKeydown(event: KeyboardEvent) {
  log('SETTINGS', 'handleHotkeyKeydown called');
  log('SETTINGS', 'activeHotkeyInput:', activeHotkeyInput ? 'set' : 'null');

  if (!activeHotkeyInput) {
    log('SETTINGS', 'No active hotkey input, returning');
    return;
  }

  // Cancel any pending blur timeout - we're still capturing
  if (blurTimeout) {
    clearTimeout(blurTimeout);
    blurTimeout = null;
    log('SETTINGS', 'Cancelled blur timeout');
  }

  event.preventDefault();
  event.stopPropagation();

  log('SETTINGS', 'Key event - key:', event.key, 'code:', event.code);
  log('SETTINGS', 'heldModifiers before:', JSON.stringify(heldModifiers));

  // Track modifier key presses
  if (event.key === 'Control') {
    heldModifiers.ctrl = true;
    log('SETTINGS', 'Ctrl pressed, waiting for main key');
    activeHotkeyInput.value = 'Ctrl+...';
    return;
  }
  if (event.key === 'Meta') {
    heldModifiers.meta = true;
    log('SETTINGS', 'Meta pressed, waiting for main key');
    activeHotkeyInput.value = 'Meta+...';
    return;
  }
  if (event.key === 'Alt') {
    heldModifiers.alt = true;
    log('SETTINGS', 'Alt pressed, waiting for main key');
    activeHotkeyInput.value = 'Alt+...';
    return;
  }
  if (event.key === 'Shift') {
    heldModifiers.shift = true;
    log('SETTINGS', 'Shift pressed, waiting for main key');
    activeHotkeyInput.value = 'Shift+...';
    return;
  }

  // Allow Escape without modifiers for cancel hotkey (but if modifiers held, capture as combo)
  if (event.key === 'Escape' && activeHotkeyKey === 'cancelHotkey') {
    const hasModifier = heldModifiers.ctrl || heldModifiers.meta || heldModifiers.alt || heldModifiers.shift;
    if (!hasModifier) {
      log('SETTINGS', 'Escape pressed for cancel hotkey (no modifiers)');
      if (activeHotkeySpan) {
        activeHotkeySpan.textContent = 'Escape';
      }
      resetHeldModifiers();
      stopHotkeyCapture();
      return;
    }
    // If modifiers held, fall through to capture as combo (e.g., Ctrl+Escape)
    log('SETTINGS', 'Escape pressed with modifiers, capturing as combo');
  }

  // Allow F-keys without modifiers
  if (isFunctionKey(event.key)) {
    log('SETTINGS', 'Function key pressed:', event.key);
    const accelerator = buildAccelerator(event.key);
    if (activeHotkeySpan) {
      activeHotkeySpan.textContent = accelerator;
    }
    resetHeldModifiers();
    stopHotkeyCapture();
    return;
  }

  // For other hotkeys, require at least one modifier
  const hasModifier = heldModifiers.ctrl || heldModifiers.meta || heldModifiers.alt || heldModifiers.shift;
  if (!hasModifier) {
    log('SETTINGS', 'No modifier held, ignoring key:', event.key);
    return;
  }

  // Non-modifier key pressed with modifier(s) held - capture the hotkey
  const accelerator = buildAccelerator(event.key);
  log('SETTINGS', 'Setting hotkey to:', accelerator);

  if (activeHotkeySpan) {
    activeHotkeySpan.textContent = accelerator;
  }
  resetHeldModifiers();
  stopHotkeyCapture();
}

function handleHotkeyKeyup(event: KeyboardEvent) {
  if (!activeHotkeyInput) return;

  // Reset modifier state when released
  if (event.key === 'Control') heldModifiers.ctrl = false;
  if (event.key === 'Meta') heldModifiers.meta = false;
  if (event.key === 'Alt') heldModifiers.alt = false;
  if (event.key === 'Shift') heldModifiers.shift = false;

  log('SETTINGS', 'Key released:', event.key, 'heldModifiers:', JSON.stringify(heldModifiers));
}

// Reset cost
async function resetCost() {
  try {
    await (window as any).electronAPI.resetCost();
    totalCostInput.value = '0';
  } catch (error) {
    log('SETTINGS', 'Failed to reset cost:', error);
  }
}

// Event listeners
log('SETTINGS', 'Setting up event listeners');
log('SETTINGS', 'hotkeyRecordInput:', hotkeyRecordInput ? 'found' : 'NOT FOUND');
log('SETTINGS', 'hotkeyCancelInput:', hotkeyCancelInput ? 'found' : 'NOT FOUND');

closeBtn.addEventListener('click', () => {
  log('SETTINGS', 'Close button clicked');
  // Ensure hotkeys are resumed if user was mid-capture
  if (activeHotkeyInput) {
    stopHotkeyCapture();
  }
  (window as any).electronAPI.closeWindow();
});

toggleApiKeyBtn.addEventListener('click', () => {
  log('SETTINGS', 'Toggle API key button clicked');
  toggleApiKeyVisibility();
});

testApiKeyBtn.addEventListener('click', () => {
  log('SETTINGS', 'Test API key button clicked');
  testApiKey();
});

// Hotkey input event listeners
hotkeyRecordInput.addEventListener('click', () => {
  log('SETTINGS', 'hotkeyRecordInput clicked');
  startHotkeyCapture(hotkeyRecordInput, currentRecordHotkeySpan, 'recordHotkey');
});

hotkeyCancelInput.addEventListener('click', () => {
  log('SETTINGS', 'hotkeyCancelInput clicked');
  startHotkeyCapture(hotkeyCancelInput, currentCancelHotkeySpan, 'cancelHotkey');
});

// Global keydown handler for hotkey capture
document.addEventListener('keydown', handleHotkeyKeydown);
document.addEventListener('keyup', handleHotkeyKeyup);

// Stop capture on blur (with delay to handle DE focus stealing on modifier press)
function handleHotkeyBlur(input: HTMLInputElement, name: string) {
  log('SETTINGS', `${name} blur`);
  if (activeHotkeyInput === input) {
    // Use a delay so keydown can cancel this if it fires
    blurTimeout = setTimeout(() => {
      log('SETTINGS', `${name} blur timeout fired, stopping capture`);
      stopHotkeyCapture();
      blurTimeout = null;
    }, 200);
  }
}

hotkeyRecordInput.addEventListener('blur', () => handleHotkeyBlur(hotkeyRecordInput, 'hotkeyRecordInput'));
hotkeyCancelInput.addEventListener('blur', () => handleHotkeyBlur(hotkeyCancelInput, 'hotkeyCancelInput'));

silenceDetectionCheckbox.addEventListener('change', updateSilenceSettingsState);
silenceThresholdSlider.addEventListener('input', () => {
  silenceThresholdValue.textContent = silenceThresholdSlider.value;
});

resetCostBtn.addEventListener('click', resetCost);
openTranscriptsFolderBtn.addEventListener('click', () => {
  log('SETTINGS', 'Open transcripts folder button clicked');
  (window as any).electronAPI.openTranscriptsFolder();
});

openAudioFolderBtn.addEventListener('click', () => {
  log('SETTINGS', 'Open audio folder button clicked');
  (window as any).electronAPI.openAudioFolder();
});

// Theme selection - applies immediately
themeGrid.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const themeOption = target.closest('.theme-option') as HTMLElement;
  if (themeOption) {
    const theme = themeOption.dataset.theme as ThemeName;
    if (theme && ALL_THEMES.includes(theme)) {
      log('SETTINGS', 'Theme selected:', theme);
      applyTheme(theme);
      // Send to main process to broadcast to all windows and persist
      (window as any).electronAPI.setTheme(theme);
    }
  }
});

// Handle API key input - hide status while typing
apiKeyInput.addEventListener('input', () => {
  log('SETTINGS', 'API key input event');
  // Hide status while editing
  apiStatus.textContent = '';
  apiStatus.className = 'status-msg';
});

// Handle API key change - restore valid status if restored to original valid key
apiKeyInput.addEventListener('change', () => {
  log('SETTINGS', 'API key change event');
  const currentValue = apiKeyInput.value;

  // If restored to original valid key, show valid status without saving
  if (currentValue === originalSettings.apiKey && originalSettings.apiKeyValid) {
    log('SETTINGS', 'API key restored to original valid key');
    apiStatus.textContent = '✓ Valid';
    apiStatus.className = 'status-msg success';
    return; // Don't save, key hasn't actually changed
  }

  // If value changed, save (which will reset apiKeyValid via IPC)
  if (currentValue !== originalSettings.apiKey) {
    log('SETTINGS', 'API key changed, saving');
    saveSettings();
  } else if (currentValue && !originalSettings.apiKeyValid) {
    // Same key but wasn't valid, show "Not validated"
    apiStatus.textContent = 'Not validated';
    apiStatus.className = 'status-msg warning';
  }
});

// Auto-save on change for all form inputs (excluding apiKeyInput which has custom handler)
const autoSaveInputs = [
  bitrateSelect,
  sampleRateSelect,
  channelCountSelect,
  microphoneSelect,
  echoCancellationCheckbox,
  noiseSuppressionCheckbox,
  autoGainControlCheckbox,
  silenceDetectionCheckbox,
  silenceThresholdSlider,
  pauseDelayInput,
  copyToClipboardCheckbox,
  autoPasteCheckbox,
  playSoundCheckbox,
  saveTranscriptsCheckbox,
  saveAudioCheckbox,
  gpuAccelerationCheckbox,
  totalCostInput,
];

autoSaveInputs.forEach(input => {
  input.addEventListener('change', () => {
    log('SETTINGS', 'Input changed:', input.id);
    saveSettings();
  });
});

// Listen for settings changes
(window as any).electronAPI.onSettingsChanged((settings: any) => {
  populateForm(settings as FormSettings);
});

// Listen for theme changes from main process
(window as any).electronAPI.onThemeChanged((theme: string) => {
  log('SETTINGS', 'Theme changed from main process:', theme);
  if (ALL_THEMES.includes(theme as ThemeName)) {
    applyTheme(theme as ThemeName);
  }
});

// Debug: log all clicks on the document
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  log('SETTINGS', 'Document click on:', target.tagName, target.id || target.className);
});

// Initialize
log('SETTINGS', 'Calling loadSettings()');
loadSettings();
log('SETTINGS', 'Settings initialization complete');

})(); // End IIFE
