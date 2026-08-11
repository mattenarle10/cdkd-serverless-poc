import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export class ServerlessStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'JobsTable', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const queue = new sqs.Queue(this, 'JobsQueue', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(1),
      visibilityTimeout: Duration.seconds(60),
    });

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const commonFunctionProps = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node24',
        externalModules: [] as string[],
      },
    };

    const apiFunction = new NodejsFunction(this, 'ApiFunction', {
      ...commonFunctionProps,
      entry: 'src/handlers/api.ts',
      handler: 'handler',
      logGroup: apiLogGroup,
      environment: {
        APP_VERSION: process.env.APP_VERSION ?? 'dev',
        JOBS_QUEUE_URL: queue.queueUrl,
        JOBS_TABLE_NAME: table.tableName,
      },
    });

    const workerFunction = new NodejsFunction(this, 'WorkerFunction', {
      ...commonFunctionProps,
      entry: 'src/handlers/worker.ts',
      handler: 'handler',
      logGroup: workerLogGroup,
      environment: {
        JOBS_TABLE_NAME: table.tableName,
      },
    });

    table.grantReadWriteData(apiFunction);
    queue.grantSendMessages(apiFunction);
    table.grantWriteData(workerFunction);

    workerFunction.addEventSource(
      new eventSources.SqsEventSource(queue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      }),
    );

    const api = new apigateway.HttpApi(this, 'JobsApi', {
      corsPreflight: {
        allowHeaders: ['content-type'],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
      },
    });

    const integration = new integrations.HttpLambdaIntegration('ApiIntegration', apiFunction);

    api.addRoutes({
      path: '/health',
      methods: [apigateway.HttpMethod.GET],
      integration,
    });

    api.addRoutes({
      path: '/jobs',
      methods: [apigateway.HttpMethod.POST],
      integration,
    });

    api.addRoutes({
      path: '/jobs/{jobId}',
      methods: [apigateway.HttpMethod.GET],
      integration,
    });

    Tags.of(this).add('project', 'cdkd-serverless-poc');
    Tags.of(this).add('environment', 'dev');

    new CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
    });
  }
}
