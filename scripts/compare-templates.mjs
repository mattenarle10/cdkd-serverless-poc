import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const stackName = 'CdkdServerlessDirect';
const cdkTemplatePath = resolve(`cdk.out.cfn/${stackName}.template.json`);
const cdkdTemplatePath = resolve(`cdk.out.cdkd/${stackName}.template.json`);

const [cdkTemplate, cdkdTemplate] = await Promise.all([
  readFile(cdkTemplatePath, 'utf8'),
  readFile(cdkdTemplatePath, 'utf8'),
]);

const cdkJson = JSON.parse(cdkTemplate);
const cdkdJson = JSON.parse(cdkdTemplate);

if (JSON.stringify(cdkJson) !== JSON.stringify(cdkdJson)) {
  console.error('The CDK and cdkd templates differ.');
  process.exitCode = 1;
} else {
  const resourceCount = Object.values(cdkJson.Resources ?? {}).filter(
    (resource) => resource.Type !== 'AWS::CDK::Metadata',
  ).length;

  console.log(`Templates match exactly: ${resourceCount} deployable resources.`);
}

