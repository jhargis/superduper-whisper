import * as https from 'https';
import * as http from 'http';
import { log, logError } from './logger';

interface TranscriptionResponse {
  text: string;
  error?: string;
  rawError?: string;
}

interface ApiKeyTestResult {
  valid: boolean;
  error?: string;
}

/**
 * Parse OpenAI API error response and return user-friendly message
 */
function parseApiError(statusCode: number, responseBody: string): string {
  log('WHISPER', 'Parsing API error, status:', statusCode, 'body:', responseBody.substring(0, 200));

  try {
    const parsed = JSON.parse(responseBody);
    const errorMessage = parsed?.error?.message || '';
    const errorType = parsed?.error?.type || '';
    const errorCode = parsed?.error?.code || '';

    // 401 errors - authentication issues
    if (statusCode === 401) {
      if (errorMessage.includes('Incorrect API key')) {
        return 'Incorrect API key';
      }
      if (errorMessage.includes('Invalid Authentication')) {
        return 'Invalid API key';
      }
      return 'API key authentication failed';
    }

    // 429 errors - rate limit or quota
    if (statusCode === 429) {
      if (errorMessage.includes('quota') || errorCode === 'insufficient_quota') {
        return 'Quota exhausted - add credits at platform.openai.com';
      }
      if (errorMessage.includes('Rate limit') || errorType === 'rate_limit_exceeded') {
        return 'Rate limited - wait a moment and retry';
      }
      return 'Too many requests - slow down';
    }

    // 500 errors - server issues
    if (statusCode === 500) {
      return 'OpenAI server error - please retry';
    }

    // 503 errors - overloaded
    if (statusCode === 503) {
      if (errorMessage.includes('Slow Down')) {
        return 'OpenAI throttling - reduce request rate';
      }
      return 'OpenAI busy - please retry later';
    }

    // 403 - region/country blocked
    if (statusCode === 403) {
      return 'API access denied - region may be blocked';
    }

    // Default: return the error message if available, otherwise generic
    if (errorMessage) {
      return errorMessage.length > 60 ? errorMessage.substring(0, 60) + '...' : errorMessage;
    }
  } catch {
    // JSON parsing failed, fall through to default
  }

  return `API error (${statusCode})`;
}

/**
 * Transcribe audio using OpenAI Whisper API
 * Reference: git-issues/stt.py:14-53
 */
export async function transcribeAudio(
  audioData: Buffer,
  filename: string,
  apiKey: string
): Promise<TranscriptionResponse> {
  return new Promise((resolve) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

    // Build multipart form data
    const bodyParts: Buffer[] = [];

    // Add file field
    bodyParts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: audio/webm\r\n\r\n`
      )
    );
    bodyParts.push(audioData);
    bodyParts.push(Buffer.from('\r\n'));

    // Add model field
    bodyParts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `whisper-1\r\n`
      )
    );

    // End boundary
    bodyParts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(bodyParts);

    const options: https.RequestOptions = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve({ text: result.text || '' });
          } catch {
            resolve({ text: '', error: 'Failed to parse API response' });
          }
        } else {
          const errorMsg = parseApiError(res.statusCode || 0, data);
          resolve({ text: '', error: errorMsg, rawError: data });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ text: '', error: `Connection failed: ${error.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ text: '', error: 'Request timed out' });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Test if an API key is valid
 * Reference: git-issues/stt.py:56-88
 */
export async function testApiKey(apiKey: string): Promise<ApiKeyTestResult> {
  log('WHISPER', 'testApiKey called');
  log('WHISPER', 'API key length:', apiKey?.length || 0);

  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 10000,
    };

    log('WHISPER', 'Making HTTPS request to api.openai.com/v1/models');

    const req = https.request(options, (res) => {
      log('WHISPER', 'Response received, status:', res.statusCode);
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        log('WHISPER', 'Response complete, status:', res.statusCode);
        log('WHISPER', 'Response data length:', data.length);
        if (res.statusCode === 200) {
          log('WHISPER', 'API key is valid');
          resolve({ valid: true });
        } else {
          const errorMsg = parseApiError(res.statusCode || 0, data);
          log('WHISPER', 'API key test failed:', res.statusCode, errorMsg);
          resolve({ valid: false, error: errorMsg });
        }
      });
    });

    req.on('error', (error) => {
      logError('WHISPER', 'Request error:', error.message);
      resolve({ valid: false, error: `Request failed: ${error.message}` });
    });

    req.on('timeout', () => {
      logError('WHISPER', 'Request timeout');
      req.destroy();
      resolve({ valid: false, error: 'Request timed out' });
    });

    req.end();
    log('WHISPER', 'Request sent');
  });
}

/**
 * Calculate transcription cost
 * Whisper API costs $0.006 per minute
 * Reference: git-issues/stt.py:91-103
 */
export function calculateCost(durationSeconds: number): number {
  const seconds = Math.ceil(durationSeconds);
  const minutes = seconds / 60;
  return minutes * 0.006;
}
