import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { processJobMessage } from '../src/handlers/worker.js';

describe('worker', () => {
  it('uppercases the input and completes the job', async () => {
    const calls: unknown[][] = [];

    await processJobMessage(JSON.stringify({ jobId: 'job-1', text: 'hello world' }), {
      completeJob: async (...args) => {
        calls.push(args);
      },
      now: () => new Date('2026-08-11T00:00:01.000Z'),
    });

    assert.deepEqual(calls, [
      ['job-1', 'HELLO WORLD', '2026-08-11T00:00:01.000Z'],
    ]);
  });

  it('rejects malformed messages', async () => {
    await assert.rejects(
      processJobMessage('{}', {
        completeJob: async () => undefined,
        now: () => new Date(),
      }),
    );
  });
});

