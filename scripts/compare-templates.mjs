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
const cdkNormalized = normalizeTemplate(cdkJson);
const cdkdNormalized = normalizeTemplate(cdkdJson);

if (JSON.stringify(cdkNormalized) !== JSON.stringify(cdkdNormalized)) {
  console.error('The CDK and cdkd templates differ.');
  for (const difference of collectDifferences(cdkNormalized, cdkdNormalized).slice(0, 20)) {
    console.error(`- ${difference}`);
  }
  process.exitCode = 1;
} else {
  const resourceCount = Object.values(cdkNormalized.Resources ?? {}).filter(
    (resource) => resource.Type !== 'AWS::CDK::Metadata',
  ).length;

  console.log(
    `Templates have the same infrastructure shape: ${resourceCount} deployable resources.`,
  );
}

function normalizeTemplate(template) {
  const normalized = structuredClone(template);

  for (const [logicalId, resource] of Object.entries(normalized.Resources ?? {})) {
    if (resource.Type === 'AWS::CDK::Metadata') {
      delete normalized.Resources[logicalId];
      continue;
    }

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

function collectDifferences(left, right, path = '$', differences = []) {
  if (Object.is(left, right)) {
    return differences;
  }

  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    differences.push(`${path}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`);
    return differences;
  }

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort()) {
    if (!(key in left)) {
      differences.push(`${path}.${key}: missing from CDK template`);
    } else if (!(key in right)) {
      differences.push(`${path}.${key}: missing from cdkd template`);
    } else {
      collectDifferences(left[key], right[key], `${path}.${key}`, differences);
    }
  }

  return differences;
}
