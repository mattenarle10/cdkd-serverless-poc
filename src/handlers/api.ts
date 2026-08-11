import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  JOB_TTL_SECONDS,
  parseJobInput,
  type JobMessage,
  type JobRecord,
} from '../domain/job.js';

export interface ApiDependencies {
  getJob(jobId: string): Promise<JobRecord | undefined>;
  putJob(job: JobRecord): Promise<void>;
  enqueueJob(message: JobMessage): Promise<void>;
  newJobId(): string;
  now(): Date;
}

export type ApiHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>;

export function createApiHandler(dependencies: ApiDependencies): ApiHandler {
  return async (event) => {
    try {
      if (event.routeKey === 'GET /health') {
        return json(200, {
          status: 'ok',
          version: process.env.APP_VERSION ?? 'dev',
        });
      }

      if (event.routeKey === 'POST /jobs') {
        return createJob(event, dependencies);
      }

      if (event.routeKey === 'GET /jobs/{jobId}') {
        return getJob(event, dependencies);
      }

      return json(404, { message: 'Route not found.' });
    } catch (error) {
      console.error('API request failed.', error);
      return json(500, { message: 'Internal server error.' });
    }
  };
}

async function createJob(
  event: APIGatewayProxyEventV2,
  dependencies: ApiDependencies,
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  const input = parseJobInput(body);

  if (!input.ok) {
    return json(400, { message: input.message });
  }

  const now = dependencies.now();
  const job: JobRecord = {
    jobId: dependencies.newJobId(),
    status: 'QUEUED',
    text: input.text,
    createdAt: now.toISOString(),
    expiresAt: Math.floor(now.getTime() / 1000) + JOB_TTL_SECONDS,
  };

  await dependencies.putJob(job);
  await dependencies.enqueueJob({ jobId: job.jobId, text: job.text });

  return json(202, {
    jobId: job.jobId,
    status: job.status,
  });
}

async function getJob(
  event: APIGatewayProxyEventV2,
  dependencies: ApiDependencies,
): Promise<APIGatewayProxyStructuredResultV2> {
  const jobId = event.pathParameters?.jobId;
  if (!jobId) {
    return json(400, { message: 'Job ID is required.' });
  }

  const job = await dependencies.getJob(jobId);
  if (!job) {
    return json(404, { message: 'Job not found.' });
  }

  return json(200, job);
}

function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function createAwsDependencies(): ApiDependencies {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const sqsClient = new SQSClient({});

  return {
    async getJob(jobId) {
      const response = await documentClient.send(
        new GetCommand({
          TableName: requiredEnv('JOBS_TABLE_NAME'),
          Key: { jobId },
        }),
      );

      return response.Item as JobRecord | undefined;
    },
    async putJob(job) {
      await documentClient.send(
        new PutCommand({
          TableName: requiredEnv('JOBS_TABLE_NAME'),
          Item: job,
          ConditionExpression: 'attribute_not_exists(jobId)',
        }),
      );
    },
    async enqueueJob(message) {
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: requiredEnv('JOBS_QUEUE_URL'),
          MessageBody: JSON.stringify(message),
        }),
      );
    },
    newJobId: randomUUID,
    now: () => new Date(),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export const handler = createApiHandler(createAwsDependencies());
