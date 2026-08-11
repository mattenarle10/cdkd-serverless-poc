#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { ServerlessStack } from '../lib/serverless-stack.js';

const app = new App();
const env = {
  ...(process.env.CDK_DEFAULT_ACCOUNT && { account: process.env.CDK_DEFAULT_ACCOUNT }),
  region: process.env.AWS_REGION ?? 'ap-southeast-1',
};

new ServerlessStack(app, 'CdkdServerlessCfn', {
  description: 'Serverless jobs POC managed through CloudFormation',
  env,
});

new ServerlessStack(app, 'CdkdServerlessDirect', {
  description: 'Serverless jobs POC managed directly by cdkd',
  env,
});
