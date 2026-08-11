import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { SQSBatchResponse, SQSEvent, SQSHandler } from 'aws-lambda';
import { parseJobMessage } from '../domain/job.js';

export interface WorkerDependencies {
  completeJob(jobId: string, result: string, processedAt: string): Promise<void>;
  now(): Date;
}

export async function processJobMessage(
  body: string,
  dependencies: WorkerDependencies,
): Promise<void> {
  const message = parseJobMessage(body);
  await dependencies.completeJob(
    message.jobId,
    message.text.toUpperCase(),
    dependencies.now().toISOString(),
  );
}

export function createWorkerHandler(dependencies: WorkerDependencies): SQSHandler {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

    await Promise.all(
      event.Records.map(async (record) => {
        try {
          await processJobMessage(record.body, dependencies);
        } catch (error) {
          console.error('Job processing failed.', { messageId: record.messageId, error });
          batchItemFailures.push({ itemIdentifier: record.messageId });
        }
      }),
    );

    return { batchItemFailures };
  };
}

function createAwsDependencies(): WorkerDependencies {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  return {
    async completeJob(jobId, result, processedAt) {
      await documentClient.send(
        new UpdateCommand({
          TableName: requiredEnv('JOBS_TABLE_NAME'),
          Key: { jobId },
          UpdateExpression: 'SET #status = :status, #result = :result, processedAt = :processedAt',
          ConditionExpression: 'attribute_exists(jobId)',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#result': 'result',
          },
          ExpressionAttributeValues: {
            ':status': 'COMPLETED',
            ':result': result,
            ':processedAt': processedAt,
          },
        }),
      );
    },
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

export const handler = createWorkerHandler(createAwsDependencies());

