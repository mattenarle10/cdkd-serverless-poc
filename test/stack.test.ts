import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ServerlessStack } from '../lib/serverless-stack.js';

describe('serverless stack', () => {
  const app = new App();
  const template = Template.fromStack(new ServerlessStack(app, 'TestStack'));

  it('contains the serverless job resources', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 3);
    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.resourceCountIs('AWS::Lambda::EventSourceMapping', 1);
    template.resourceCountIs('AWS::SQS::Queue', 1);
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.resourceCountIs('AWS::Logs::LogGroup', 2);
  });

  it('uses on-demand DynamoDB with TTL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: {
        AttributeName: 'expiresAt',
        Enabled: true,
      },
    });
  });

  it('connects SQS to the worker with partial batch failure reporting', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 5,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
      EventSourceArn: Match.objectLike({ 'Fn::GetAtt': Match.anyValue() }),
    });
  });

  it('outputs the API URL', () => {
    const outputs = template.findOutputs('ApiUrl');
    assert.equal(Object.keys(outputs).length, 1);
  });
});

