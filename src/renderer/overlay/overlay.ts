// Superduper Whisper - Main Bar Logic
// Minimal horizontal bar interface with waveform visualizer

(function() {
// Helper for debug logging to file
const log = (tag: string, ...args: unknown[]) => {
  (window as any).electronAPI?.debugLog(tag, ...args);
  console.log(`[${tag}]`, ...args);
};

log('OVERLAY', 'Overlay script loading...');

// Theme support
type ThemeName = 'dark' | 'light' | 'dracula' | 'nord' | 'retro' | 'monokai' | 'synthwave' | 'forest' | 'onedark' | 'gruvbox' | 'sunset' | 'catppuccin';
const ALL_THEMES: ThemeName[] = ['dark', 'light', 'dracula', 'nord', 'retro', 'monokai', 'synthwave', 'forest', 'onedark', 'gruvbox', 'sunset', 'catppuccin'];

function applyTheme(theme: ThemeName) {
  log('OVERLAY', 'applyTheme called:', theme);
  const root = document.documentElement;
  ALL_THEMES.forEach(t => root.classList.remove(t));
  root.classList.add(theme);
}

interface OverlayState {
  isRecording: boolean;
  isPaused: boolean;
  isCancelled: boolean;
  startTime: number;
  pausedTime: number;
  pauseStart: number | null;
  silenceStart: number | null;
  audioChunks: Blob[];
}

// DOM Elements
const canvas = document.getElementById('waveform') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statusIcon = document.getElementById('status-icon')!;
const statusText = document.getElementById('status-text')!;
const timerBadge = document.getElementById('timer-badge')!;
const timerElement = document.getElementById('timer')!;
const settingsBtn = document.getElementById('settings-btn')!;
const recordHotkeyEl = document.getElementById('record-hotkey')!;
const cancelHotkeyEl = document.getElementById('cancel-hotkey')!;
const runningCostEl = document.getElementById('running-cost')!;
const collapseHandle = document.getElementById('collapse-handle')!;
const hotkeyIcons = document.querySelectorAll('.hotkey-icon');
const errorDetailsBtn = document.getElementById('error-details-btn')!;

// Mini view state
let isMiniView = false;

// Current raw error for details window
let currentRawError: string | null = null;

// Mic mute monitoring
let micMonitorStream: MediaStream | null = null;
let isMicMuted = false;

// Audio components
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let animationFrameId: number | null = null;

// State
const state: OverlayState = {
  isRecording: false,
  isPaused: false,
  isCancelled: false,
  startTime: 0,
  pausedTime: 0,
  pauseStart: null,
  silenceStart: null,
  audioChunks: [],
};

// Visualizer constants
const MIN_GAIN = 1.5;
const MAX_GAIN = 5.0;
const TARGET_PEAK = 0.6;
const SMOOTHING = 0.92;
let currentGain = MIN_GAIN;

// Settings
let settings = {
  silenceDetection: true,
  silenceThreshold: 5,
  pauseDelay: 2500,
  microphoneId: '',
  bitrate: 64000,
  sampleRate: 48000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  playSound: true,
  recordHotkey: 'CommandOrControl+Shift+Space',
  cancelHotkey: 'Escape',
  totalCost: 0,
  apiKeyValid: false,
};

// Format hotkey for display
function formatHotkeyDisplay(hotkey: string): string {
  return hotkey
    .replace('CommandOrControl', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Meta', '⌘')
    .replace(/\+/g, '');
}

// Get the appropriate idle status text based on current state
function getIdleStatusText(): { text: string; className: string } {
  if (isMicMuted) {
    return { text: 'Mic muted', className: 'mic-muted' };
  }
  if (!settings.apiKeyValid) {
    return { text: 'API Key Missing', className: 'api-missing' };
  }
  return { text: 'Ready', className: '' };
}

// Update idle status display
function updateIdleStatus() {
  if (state.isRecording) return;

  const status = getIdleStatusText();
  statusText.textContent = status.text;
  statusText.classList.remove('mic-muted', 'api-missing');
  if (status.className) {
    statusText.classList.add(status.className);
  }
}

// Update UI for mic mute state
function updateMicMuteUI(muted: boolean) {
  log('OVERLAY', 'Mic mute state changed:', muted);
  isMicMuted = muted;

  // Update hotkey elements
  recordHotkeyEl.classList.toggle('mic-muted', muted);
  cancelHotkeyEl.classList.toggle('mic-muted', muted);
  hotkeyIcons.forEach(icon => icon.classList.toggle('mic-muted', muted));

  // Update status text if not recording
  updateIdleStatus();
}

// Start monitoring mic mute state
async function startMicMuteMonitoring() {
  log('OVERLAY', 'Starting mic mute monitoring...');
  try {
    // Create a minimal audio stream just for monitoring
    micMonitorStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTrack = micMonitorStream.getAudioTracks()[0];

    if (audioTrack) {
      // Check initial state
      updateMicMuteUI(audioTrack.muted);

      // Listen for mute/unmute events
      audioTrack.addEventListener('mute', () => {
        log('OVERLAY', 'Mic mute event received');
        updateMicMuteUI(true);
      });

      audioTrack.addEventListener('unmute', () => {
        log('OVERLAY', 'Mic unmute event received');
        updateMicMuteUI(false);
      });

      log('OVERLAY', 'Mic mute monitoring started, initial muted state:', audioTrack.muted);
    }
  } catch (error) {
    log('OVERLAY', 'Failed to start mic mute monitoring:', error);
  }
}

// Stop mic mute monitoring
function stopMicMuteMonitoring() {
  if (micMonitorStream) {
    micMonitorStream.getTracks().forEach(track => track.stop());
    micMonitorStream = null;
    log('OVERLAY', 'Mic mute monitoring stopped');
  }
}

// Load settings on init
async function loadSettings() {
  try {
    const loadedSettings = await (window as any).electronAPI.getSettings();
    settings = { ...settings, ...loadedSettings };
    updateDisplay();
    updateIdleStatus();

    // Apply theme
    if (loadedSettings.theme && ALL_THEMES.includes(loadedSettings.theme)) {
      applyTheme(loadedSettings.theme);
    }

    // Restore mini view state
    if (loadedSettings.mainWindowMini) {
      isMiniView = true;
      document.body.classList.add('mini');
      log('OVERLAY', 'Restored mini view state');
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Format cost for display (always 4 decimal places)
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

// Update display elements
function updateDisplay() {
  const recordKey = formatHotkeyDisplay(settings.recordHotkey);
  const cancelKey = formatHotkeyDisplay(settings.cancelHotkey);
  recordHotkeyEl.textContent = recordKey;
  cancelHotkeyEl.textContent = cancelKey;
  runningCostEl.textContent = formatCost(settings.totalCost);
}

// Set status
function setStatus(status: 'ready' | 'recording' | 'processing' | 'success' | 'error', text: string) {
  statusIcon.className = status;

  // When returning to ready state, check for warnings (mic muted, API key missing)
  if (status === 'ready' && text === 'Ready') {
    const idleStatus = getIdleStatusText();
    statusText.textContent = idleStatus.text;
    statusText.classList.remove('mic-muted', 'api-missing');
    if (idleStatus.className) {
      statusText.classList.add(idleStatus.className);
    }
  } else {
    statusText.textContent = text;
    statusText.classList.remove('mic-muted', 'api-missing');
  }

  // Use classList to preserve mini class
  document.body.classList.remove('recording', 'processing', 'paused');
  if (status === 'recording') {
    document.body.classList.add('recording');
  } else if (status === 'processing') {
    document.body.classList.add('processing');
  }
}

// Timer formatting
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateTimer() {
  if (!state.isRecording) return;

  let elapsed = Date.now() - state.startTime - state.pausedTime;
  if (state.isPaused && state.pauseStart) {
    elapsed -= (Date.now() - state.pauseStart);
  }

  timerElement.textContent = formatTime(Math.max(0, elapsed));
}

// Play completion sound
function playCompletionSound() {
  if (!settings.playSound) return;

  try {
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(1108.73, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);

    setTimeout(() => audioCtx.close(), 500);
  } catch (error) {
    console.error('Failed to play completion sound:', error);
  }
}

// Play error/blocked sound (descending tone)
function playErrorSound() {
  if (!settings.playSound) return;

  try {
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Descending tone: starts high, drops low
    oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(250, audioCtx.currentTime + 0.15);

    gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.25);

    setTimeout(() => audioCtx.close(), 400);
  } catch (error) {
    console.error('Failed to play error sound:', error);
  }
}

// Waveform visualizer
function drawWaveform() {
  if (!analyser) {
    // Draw flat line when not recording
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#6e7681';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    return;
  }

  if (!state.isRecording) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);

  // Find max deviation from center (128)
  let maxDeviation = 0;
  for (let i = 0; i < dataArray.length; i++) {
    maxDeviation = Math.max(maxDeviation, Math.abs(dataArray[i] - 128));
  }

  // Auto-gain calculation
  const normalizedMax = maxDeviation / 128;
  if (normalizedMax > 0) {
    const targetGain = TARGET_PEAK / normalizedMax;
    if (targetGain < currentGain) {
      currentGain = currentGain * 0.7 + targetGain * 0.3;
    } else {
      currentGain = currentGain * SMOOTHING + targetGain * (1 - SMOOTHING);
    }
    currentGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, currentGain));
  }

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Set waveform color based on state
  ctx.strokeStyle = state.isPaused ? '#6e7681' : '#f85149';
  ctx.lineWidth = 2;
  ctx.beginPath();

  const sliceWidth = canvas.width / dataArray.length;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const v = ((dataArray[i] - 128) * currentGain) / 128 + 0.5;
    const y = v * canvas.height;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.stroke();

  // Silence detection
  if (settings.silenceDetection && !state.isPaused) {
    checkSilence(maxDeviation);
  }

  // Check for resume from silence
  if (state.isPaused && settings.silenceDetection) {
    const resumeDeviation = settings.silenceThreshold + 4;
    if (maxDeviation > resumeDeviation) {
      resumeRecording();
    }
  }

  // Update timer
  updateTimer();

  animationFrameId = requestAnimationFrame(drawWaveform);
}

// Silence detection
function checkSilence(maxDeviation: number) {
  const silenceDeviation = 1 + settings.silenceThreshold;

  if (maxDeviation < silenceDeviation) {
    if (!state.silenceStart) {
      state.silenceStart = Date.now();
    } else if (Date.now() - state.silenceStart > settings.pauseDelay) {
      pauseRecording();
    }
  } else {
    state.silenceStart = null;
  }
}

function pauseRecording() {
  if (state.isPaused) return;

  state.isPaused = true;
  state.pauseStart = Date.now();

  setStatus('recording', 'Paused');
  document.body.classList.add('paused');

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
  }

  // Notify main process for tray icon update
  (window as any).electronAPI.notifyPause();
}

function resumeRecording() {
  if (!state.isPaused) return;

  if (state.pauseStart) {
    state.pausedTime += Date.now() - state.pauseStart;
  }

  state.isPaused = false;
  state.pauseStart = null;
  state.silenceStart = null;

  setStatus('recording', 'Recording');
  document.body.classList.remove('paused');

  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
  }

  // Notify main process for tray icon update
  (window as any).electronAPI.notifyResume();
}

// Start recording
async function startRecording() {
  // Block recording if mic is muted at system level
  if (isMicMuted) {
    log('OVERLAY', 'Recording blocked - mic is muted');
    // Flash the status text and play error sound
    statusText.classList.add('flash');
    setTimeout(() => statusText.classList.remove('flash'), 300);
    playErrorSound();
    // Notify main process to reset tray icon
    (window as any).electronAPI.cancelRecording();
    return;
  }

  await loadSettings();

  try {
    const audioConstraints: MediaTrackConstraints = {
      channelCount: settings.channelCount,
      sampleRate: settings.sampleRate,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
    };

    // Use selected microphone if specified
    if (settings.microphoneId) {
      audioConstraints.deviceId = { exact: settings.microphoneId };
      log('OVERLAY', 'Using microphone:', settings.microphoneId);
    }

    const constraints: MediaStreamConstraints = {
      audio: audioConstraints,
    };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType,
      audioBitsPerSecond: settings.bitrate,
    });

    state.audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      await processRecording();
    };

    mediaRecorder.start(100);

    // Reset state
    state.isRecording = true;
    state.isPaused = false;
    state.startTime = Date.now();
    state.pausedTime = 0;
    state.pauseStart = null;
    state.silenceStart = null;
    currentGain = MIN_GAIN;

    // Update UI
    setStatus('recording', 'Recording');
    timerBadge.classList.remove('hidden');

    // Start visualization loop
    drawWaveform();

  } catch (error) {
    console.error('Failed to start recording:', error);
    setStatus('error', 'Mic Error');
  }
}

// Stop recording
function stopRecording() {
  if (!state.isRecording) return;

  state.isRecording = false;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  // Show processing state
  setStatus('processing', 'Processing');
  timerBadge.classList.add('hidden');
}

// Cancel recording
function cancelRecording() {
  // Only cancel if actually recording
  if (!state.isRecording) {
    log('OVERLAY', 'Cancel ignored - not recording');
    return;
  }

  state.isRecording = false;
  state.isCancelled = true;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  cleanup();
  setStatus('ready', 'Cancelled');
  timerBadge.classList.add('hidden');

  // Reset to Ready after brief display (skip if recording started again)
  setTimeout(() => {
    if (!state.isRecording) {
      setStatus('ready', 'Ready');
      drawWaveform();
    }
  }, 1000);
}

// Process and send recording
async function processRecording() {
  // If recording was cancelled, skip processing entirely
  if (state.isCancelled) {
    log('OVERLAY', 'Recording was cancelled, skipping processing');
    state.isCancelled = false; // Reset flag
    cleanup();
    return;
  }

  if (state.audioChunks.length === 0) {
    cleanup();
    setStatus('ready', 'Ready');
    drawWaveform();
    return;
  }

  const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
  const duration = (Date.now() - state.startTime - state.pausedTime) / 1000;

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();

    const result = await (window as any).electronAPI.sendRecordingData({
      audioBuffer: arrayBuffer,
      duration,
    });

    if (result.error) {
      setStatus('error', result.error);
      document.body.classList.add('error-state');
      currentRawError = result.rawError || null;
      // Don't auto-hide - user must open settings to dismiss
    } else if (result.text) {
      playCompletionSound();
      setStatus('success', 'Copied!');

      // Reset after brief delay
      setTimeout(() => {
        setStatus('ready', 'Ready');
        drawWaveform();
      }, 1500);
    } else {
      setStatus('ready', 'No speech');
      setTimeout(() => {
        setStatus('ready', 'Ready');
        drawWaveform();
      }, 1500);
    }

  } catch (error) {
    console.error('Transcription error:', error);
    setStatus('error', 'Error');
    setTimeout(() => {
      setStatus('ready', 'Ready');
      drawWaveform();
    }, 2000);
  }

  cleanup();
}

// Cleanup resources
function cleanup() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  analyser = null;
  mediaRecorder = null;
  state.audioChunks = [];
}

// Toggle recording
function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// Event listeners
settingsBtn.addEventListener('click', () => {
  log('OVERLAY', 'Settings button clicked');

  // Clear error state if present
  if (document.body.classList.contains('error-state')) {
    document.body.classList.remove('error-state');
    currentRawError = null;
    setStatus('ready', 'Ready');
    drawWaveform();
  }

  log('OVERLAY', 'Calling (window as any).electronAPI.showSettings()');
  (window as any).electronAPI.showSettings();
  log('OVERLAY', 'showSettings() call completed');
});

// Error details button handler - use mousedown to avoid focus issues
errorDetailsBtn.addEventListener('mousedown', (e) => {
  e.preventDefault();
  log('OVERLAY', 'Error details button clicked');
  if (currentRawError) {
    (window as any).electronAPI.showErrorDetails(currentRawError);
  }
});

// Single click on handle: toggle mini/full view
collapseHandle.addEventListener('click', () => {
  log('OVERLAY', 'Handle clicked, isMiniView:', isMiniView);
  isMiniView = !isMiniView;
  document.body.classList.toggle('mini', isMiniView);
  (window as any).electronAPI.setMiniView(isMiniView);
  log('OVERLAY', 'Toggled to:', isMiniView ? 'mini' : 'full');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (state.isRecording) {
      cancelRecording();
    } else {
      (window as any).electronAPI.closeWindow();
    }
  }
});

// Listen for IPC events from main process
(window as any).electronAPI.onRecordingStart(() => {
  startRecording();
});

(window as any).electronAPI.onRecordingStop(() => {
  stopRecording();
});

(window as any).electronAPI.onRecordingCancel(() => {
  cancelRecording();
});

// Listen for settings changes
(window as any).electronAPI.onSettingsChanged((newSettings: any) => {
  settings = { ...settings, ...newSettings };
  updateDisplay();
  updateIdleStatus();
});

// Listen for theme changes
(window as any).electronAPI.onThemeChanged((theme: string) => {
  log('OVERLAY', 'Theme changed:', theme);
  if (ALL_THEMES.includes(theme as ThemeName)) {
    applyTheme(theme as ThemeName);
  }
});

// Initialize
log('OVERLAY', 'Initializing...');
log('OVERLAY', 'settingsBtn element:', settingsBtn ? 'found' : 'NOT FOUND');
loadSettings();
startMicMuteMonitoring();
drawWaveform(); // Draw initial flat line
log('OVERLAY', 'Initialization complete');

})(); // End IIFE
