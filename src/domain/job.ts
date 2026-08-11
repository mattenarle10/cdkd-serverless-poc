export const MAX_TEXT_LENGTH = 200;
export const JOB_TTL_SECONDS = 60 * 60;

export interface JobRecord {
  jobId: string;
  status: 'QUEUED' | 'COMPLETED';
  text: string;
  createdAt: string;
  expiresAt: number;
  processedAt?: string;
  result?: string;
}

export interface JobMessage {
  jobId: string;
  text: string;
}

export type ParseJobInputResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

export function parseJobInput(body: string | undefined): ParseJobInputResult {
  if (!body) {
    return { ok: false, message: 'Request body is required.' };
  }

  try {
    const value: unknown = JSON.parse(body);
    if (!isRecord(value) || typeof value.text !== 'string') {
      return { ok: false, message: 'Body must contain a text string.' };
    }

    const text = value.text.trim();
    if (text.length === 0) {
      return { ok: false, message: 'Text must not be empty.' };
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return { ok: false, message: `Text must be ${MAX_TEXT_LENGTH} characters or fewer.` };
    }

    return { ok: true, text };
  } catch {
    return { ok: false, message: 'Request body must be valid JSON.' };
  }
}

export function parseJobMessage(body: string): JobMessage {
  const value: unknown = JSON.parse(body);
  if (!isRecord(value) || typeof value.jobId !== 'string' || typeof value.text !== 'string') {
    throw new Error('Invalid job message.');
  }

  return {
    jobId: value.jobId,
    text: value.text,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

