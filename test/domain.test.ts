import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_TEXT_LENGTH, parseJobInput, parseJobMessage } from '../src/domain/job.js';

describe('job input', () => {
  it('accepts and trims valid text', () => {
    assert.deepEqual(parseJobInput(JSON.stringify({ text: '  hello  ' })), {
      ok: true,
      text: 'hello',
    });
  });

  it('rejects missing, malformed, empty, and oversized input', () => {
    assert.equal(parseJobInput(undefined).ok, false);
    assert.equal(parseJobInput('{').ok, false);
    assert.equal(parseJobInput(JSON.stringify({ text: '   ' })).ok, false);
    assert.equal(parseJobInput(JSON.stringify({ text: 'x'.repeat(MAX_TEXT_LENGTH + 1) })).ok, false);
  });

  it('parses valid queue messages and rejects invalid ones', () => {
    assert.deepEqual(parseJobMessage(JSON.stringify({ jobId: 'job-1', text: 'hello' })), {
      jobId: 'job-1',
      text: 'hello',
    });
    assert.throws(() => parseJobMessage(JSON.stringify({ jobId: 'job-1' })));
  });
});

