import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createApiHandler, type ApiDependencies } from '../src/handlers/api.js';
import type { JobMessage, JobRecord } from '../src/domain/job.js';

describe('API handler', () => {
  it('returns health and the application version', async () => {
    process.env.APP_VERSION = 'test-version';
    const response = await createApiHandler(createDependencies())(event('GET /health'));

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body ?? '{}'), {
      status: 'ok',
      version: 'test-version',
    });
  });

  it('creates and enqueues a valid job', async () => {
    let written: JobRecord | undefined;
    let queued: JobMessage | undefined;
    const dependencies = createDependencies({
      putJob: async (job) => {
        written = job;
      },
      enqueueJob: async (message) => {
        queued = message;
      },
    });

    const response = await createApiHandler(dependencies)(
      event('POST /jobs', { body: JSON.stringify({ text: 'hello' }) }),
    );

    assert.equal(response.statusCode, 202);
    assert.equal(written?.jobId, 'job-1');
    assert.equal(written?.status, 'QUEUED');
    assert.deepEqual(queued, { jobId: 'job-1', text: 'hello' });
  });

  it('rejects invalid job input', async () => {
    const response = await createApiHandler(createDependencies())(
      event('POST /jobs', { body: JSON.stringify({ text: '' }) }),
    );

    assert.equal(response.statusCode, 400);
  });

  it('returns an existing job and reports a missing job', async () => {
    const job: JobRecord = {
      jobId: 'job-1',
      status: 'COMPLETED',
      text: 'hello',
      result: 'HELLO',
      createdAt: '2026-08-11T00:00:00.000Z',
      processedAt: '2026-08-11T00:00:01.000Z',
      expiresAt: 1,
    };
    const found = await createApiHandler(createDependencies({ getJob: async () => job }))(
      event('GET /jobs/{jobId}', { pathParameters: { jobId: 'job-1' } }),
    );
    const missing = await createApiHandler(createDependencies())(
      event('GET /jobs/{jobId}', { pathParameters: { jobId: 'missing' } }),
    );

    assert.equal(found.statusCode, 200);
    assert.equal(missing.statusCode, 404);
  });
});

function createDependencies(overrides: Partial<ApiDependencies> = {}): ApiDependencies {
  return {
    getJob: async () => undefined,
    putJob: async () => undefined,
    enqueueJob: async () => undefined,
    newJobId: () => 'job-1',
    now: () => new Date('2026-08-11T00:00:00.000Z'),
    ...overrides,
  };
}

function event(
  routeKey: string,
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey,
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '111122223333',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: routeKey.split(' ')[0] ?? 'GET',
        path: '/',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'request-id',
      routeKey,
      stage: '$default',
      time: '11/Aug/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

