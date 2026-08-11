# Benchmark Worksheet

This is a small deployment-loop comparison, not a universal AWS benchmark.

Do not fill the table with numbers from the cdkd repository. Record only runs performed from this checkout against the same sandbox account and region.

## Record the Environment

| Detail | Value |
|---|---|
| Date | TODO |
| Machine and architecture | TODO |
| Node.js version | TODO |
| Region | TODO |
| `@go-to-k/cdkd` version | TODO |
| AWS CDK CLI version | TODO |
| `aws-cdk-lib` version | TODO |
| Sample size | 3 clean rounds per engine |

Before every run:

```bash
export AWS_PROFILE=your-aws-profile
export AWS_REGION=ap-southeast-1

aws sts get-caller-identity --profile "$AWS_PROFILE"
npm ci
npm run verify
```

Stop if the identity is not the intended sandbox account.

## Completion Rule

Use `cdkd --full-wait` for the comparison. A deployment counts as successful only when:

1. The deployment command exits successfully.
2. `scripts/smoke-test.mjs` creates a job.
3. The worker completes it within 30 seconds.
4. The stored result matches the expected uppercase text.

## Cold Deployment

Run each engine against its own clean stack:

```bash
APP_VERSION=baseline \
  /usr/bin/time -p npx cdk deploy CdkdServerlessCfn \
  --profile "$AWS_PROFILE" \
  --require-approval never \
  --outputs-file cdk.outputs.json

API_URL=$(node scripts/resolve-api-url.mjs cdk CdkdServerlessCfn) \
  node scripts/smoke-test.mjs
```

```bash
APP_VERSION=baseline \
  /usr/bin/time -p npx cdkd deploy CdkdServerlessDirect \
  --profile "$AWS_PROFILE" \
  --full-wait \
  --yes

API_URL=$(node scripts/resolve-api-url.mjs cdkd CdkdServerlessDirect) \
  node scripts/smoke-test.mjs
```

Alternate the order between rounds so one engine does not always run first.

| Clean deploy | CDK + CloudFormation | cdkd `--full-wait` |
|---|---:|---:|
| Run 1 | TODO | TODO |
| Run 2 | TODO | TODO |
| Run 3 | TODO | TODO |
| Median | TODO | TODO |

## Small Configuration Update

Keep both stacks deployed. Change only `APP_VERSION`, then deploy again:

```bash
APP_VERSION=update-1 \
  /usr/bin/time -p npx cdk deploy CdkdServerlessCfn \
  --profile "$AWS_PROFILE" \
  --require-approval never \
  --outputs-file cdk.outputs.json
```

```bash
APP_VERSION=update-1 \
  /usr/bin/time -p npx cdkd deploy CdkdServerlessDirect \
  --profile "$AWS_PROFILE" \
  --full-wait \
  --yes
```

Call `/health` and confirm both report `update-1`, then run the complete smoke test again.

| Update deploy | CDK + CloudFormation | cdkd `--full-wait` |
|---|---:|---:|
| Run 1 | TODO | TODO |
| Run 2 | TODO | TODO |
| Run 3 | TODO | TODO |
| Median | TODO | TODO |

## Destroy and Verify

Measure cleanup separately:

```bash
/usr/bin/time -p npx cdk destroy CdkdServerlessCfn \
  --profile "$AWS_PROFILE" \
  --force

/usr/bin/time -p npx cdkd destroy CdkdServerlessDirect \
  --profile "$AWS_PROFILE" \
  --purge-events \
  --yes
```

| Destroy | CDK + CloudFormation | cdkd |
|---|---:|---:|
| Run 1 | TODO | TODO |
| Run 2 | TODO | TODO |
| Run 3 | TODO | TODO |
| Median | TODO | TODO |

After every round:

- Confirm the CloudFormation stack no longer exists.
- Confirm `cdkd state list` no longer shows the direct stack.
- Check the DynamoDB table, SQS queue, Lambda functions, API, and log groups are gone.
- Keep raw command output with account IDs, ARNs, resource names, and URLs removed before publication.

## What the Numbers Can Show

The results can describe this application, account, region, machine, and sample.

They cannot prove that cdkd is always faster, that every resource type behaves the same, or that cdkd should replace CloudFormation in production.

