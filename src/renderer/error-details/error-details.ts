(function() {
  const log = (tag: string, ...args: unknown[]) => {
    (window as any).electronAPI?.debugLog(tag, ...args);
    console.log(`[${tag}]`, ...args);
  };

  log('ERROR-DETAILS', 'Script loaded');

  // Get DOM elements
  const closeBtn = document.getElementById('close-btn');
  const errorText = document.getElementById('error-text');

  if (!closeBtn || !errorText) {
    log('ERROR-DETAILS', 'Required elements not found');
    return;
  }

  // Close button handler
  closeBtn.addEventListener('click', () => {
    log('ERROR-DETAILS', 'Close button clicked');
    (window as any).electronAPI?.closeWindow();
  });

  // Theme support - same as overlay
  type ThemeName = 'dark' | 'light' | 'dracula' | 'nord' | 'retro' | 'monokai' | 'synthwave' | 'forest' | 'onedark' | 'gruvbox' | 'sunset' | 'catppuccin';
  const ALL_THEMES: ThemeName[] = ['dark', 'light', 'dracula', 'nord', 'retro', 'monokai', 'synthwave', 'forest', 'onedark', 'gruvbox', 'sunset', 'catppuccin'];

  function applyTheme(theme: ThemeName) {
    log('ERROR-DETAILS', 'applyTheme called:', theme);
    const root = document.documentElement;
    ALL_THEMES.forEach(t => root.classList.remove(t));
    root.classList.add(theme);
  }

  // Receive error data from main process
  (window as any).electronAPI?.onErrorData((data: { rawError: string; theme: string }) => {
    log('ERROR-DETAILS', 'Received error data', { theme: data.theme, errorLength: data.rawError?.length });

    // Apply theme
    if (ALL_THEMES.includes(data.theme as ThemeName)) {
      applyTheme(data.theme as ThemeName);
    }

    // Try to format JSON for better readability
    let formattedError = data.rawError;
    try {
      const parsed = JSON.parse(data.rawError);
      formattedError = JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, display as-is
    }

    errorText.textContent = formattedError;
  });

  log('ERROR-DETAILS', 'Initialization complete');
})();
