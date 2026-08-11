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
const cdkNormalized = normalizeAssetHashes(cdkJson);
const cdkdNormalized = normalizeAssetHashes(cdkdJson);

if (JSON.stringify(cdkNormalized) !== JSON.stringify(cdkdNormalized)) {
  console.error('The CDK and cdkd templates differ.');
  process.exitCode = 1;
} else {
  const resourceCount = Object.values(cdkNormalized.Resources ?? {}).filter(
    (resource) => resource.Type !== 'AWS::CDK::Metadata',
  ).length;

  console.log(
    `Templates have the same infrastructure shape: ${resourceCount} deployable resources.`,
  );
}

function normalizeAssetHashes(template) {
  const normalized = structuredClone(template);

  for (const resource of Object.values(normalized.Resources ?? {})) {
    if (resource.Type !== 'AWS::Lambda::Function') {
      continue;
    }

    const s3Key = resource.Properties?.Code?.S3Key;
    if (typeof s3Key === 'string' && /^[a-f0-9]{64}\.zip$/.test(s3Key)) {
      resource.Properties.Code.S3Key = '<lambda-asset-hash>.zip';
    }

    const assetPath = resource.Metadata?.['aws:asset:path'];
    if (typeof assetPath === 'string' && /^asset\.[a-f0-9]{64}$/.test(assetPath)) {
      resource.Metadata['aws:asset:path'] = 'asset.<lambda-asset-hash>';
    }
  }

  return normalized;
}
