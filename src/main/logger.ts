import * as fs from 'fs';
import * as path from 'path';

const logFile = path.join(process.cwd(), 'debug.log');
const MAX_LOG_LINES = 1000;

// Truncate log file on startup to keep only the most recent lines
function truncateLog(): void {
  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n');

      if (lines.length > MAX_LOG_LINES) {
        // Keep only the most recent lines
        const truncatedLines = lines.slice(-MAX_LOG_LINES);
        fs.writeFileSync(logFile, truncatedLines.join('\n'));
      }
    }
  } catch (err) {
    // If truncation fails, just continue - logging will still work
  }

  // Append startup marker
  fs.appendFileSync(logFile, `\n=== Superduper Whisper Debug Log ===\nStarted: ${new Date().toISOString()}\n\n`);
}

truncateLog();

export function log(tag: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  const line = `[${timestamp}] [${tag}] ${message}\n`;

  // Write to file
  fs.appendFileSync(logFile, line);

  // Also log to console
  console.log(`[${tag}]`, ...args);
}

export function logError(tag: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  const line = `[${timestamp}] [${tag}] ERROR: ${message}\n`;

  fs.appendFileSync(logFile, line);
  console.error(`[${tag}]`, ...args);
}
