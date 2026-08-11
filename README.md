# cdkd Serverless POC

I like building AWS infrastructure with CDK.

The awkward part during a POC is waiting for CloudFormation every time I change one Lambda setting, queue, permission, or environment variable.

Then I found [cdkd](https://github.com/go-to-k/cdkd), an experimental project from [Kenta Goto](https://github.com/go-to-k). It runs the same CDK app but deploys resources through direct AWS API calls instead of asking CloudFormation to manage the deployment.

The question for this repo is simple:

> Can I replace `cdk deploy` with `cdkd deploy` in a development CI/CD stage without rewriting my CDK app?

This is a dev/test experiment. It is not a recommendation to replace CloudFormation in production.

## Architecture

```txt
POST /jobs
     |
     v
API Gateway HTTP API
     |
     v
API Lambda ------> DynamoDB (QUEUED)
     |
     v
SQS Queue
     |
     v
Worker Lambda ---> DynamoDB (COMPLETED)
```

The API accepts a small text job. The worker converts the text to uppercase and stores the result.

| Route | Result |
|---|---|
| `GET /health` | Returns the deployed application version |
| `POST /jobs` | Creates a queued job and returns its ID |
| `GET /jobs/{jobId}` | Returns the current status and result |

The API is intentionally public and unauthenticated for this POC. Do not copy that shortcut into a production service.

## Same CDK App, Two Deployment Engines

One stack class creates the whole application. The CDK app instantiates it twice so the state engines never manage the same resources:

```txt
CdkdServerlessCfn    -> cdk deploy  -> CloudFormation state
CdkdServerlessDirect -> cdkd deploy -> cdkd S3 state
```

Locally, both CLIs synthesize the same infrastructure shape for `CdkdServerlessDirect`. The verification command checks the TypeScript, runs 13 tests, bundles both Lambdas, synthesizes with both CLIs, normalizes their content-addressed Lambda asset hashes, and compares the remaining template JSON.

```bash
npm ci
npm run verify
```

Expected final line:

```txt
Templates have the same infrastructure shape: 20 deployable resources.
```

Nothing in that command creates AWS resources.

## AWS Preflight

The commands below create resources and may cost money. Use a dedicated sandbox account.

Set an explicit profile and region, then confirm the identity before bootstrapping or deploying:

```bash
export AWS_PROFILE=your-aws-profile
export AWS_REGION=ap-southeast-1

aws sts get-caller-identity --profile "$AWS_PROFILE"
```

If the account is not the sandbox you expected, stop.

Bootstrap each deployment engine once:

```bash
npx cdk bootstrap \
  --profile "$AWS_PROFILE"

npx cdkd bootstrap \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --yes
```

cdkd calls AWS service APIs directly. The normal CDK bootstrap deployment role is not enough. Use a dedicated short-lived role in the sandbox account and follow the current [cdkd role guidance](https://github.com/go-to-k/cdkd/blob/main/docs/cli-reference.md#--role-arn).

## Deploy and Verify

Deploy the CloudFormation-managed copy:

```bash
npx cdk deploy CdkdServerlessCfn \
  --profile "$AWS_PROFILE" \
  --require-approval never \
  --outputs-file cdk.outputs.json

API_URL=$(node scripts/resolve-api-url.mjs cdk CdkdServerlessCfn) \
  node scripts/smoke-test.mjs
```

Deploy the cdkd-managed copy with the conservative completion mode:

```bash
npx cdkd deploy CdkdServerlessDirect \
  --profile "$AWS_PROFILE" \
  --full-wait \
  --yes

API_URL=$(node scripts/resolve-api-url.mjs cdkd CdkdServerlessDirect) \
  node scripts/smoke-test.mjs
```

`--full-wait` keeps the comparison on the same definition of finished. `--no-wait` is useful for iteration, but a quick return is not proof that the application is ready for its smoke test.

## CI/CD Command Swap

The manual [deployment workflow](./.github/workflows/deploy.yml) accepts:

- engine: `cdkd` or `cdk`
- operation: `bootstrap`, `deploy`, or `destroy`

The important command change is small:

```txt
cdk deploy CdkdServerlessCfn

becomes

cdkd deploy CdkdServerlessDirect --full-wait --yes
```

The workflow uses GitHub OIDC rather than long-lived AWS access keys. Before running it, create a protected `development` environment containing:

- environment variable `AWS_REGION`
- environment secret `AWS_ROLE_ARN`

Restrict the role's trust policy to this repository and the `development` environment. The workflow masks the deployed API URL, runs the end-to-end job test, and never prints the AWS account identity.

AWS deployment is manual so a fork, pull request, or ordinary push cannot create infrastructure accidentally. The normal CI workflow still runs `npm run verify` on every push and pull request.

## Cleanup

Use the engine that created each stack:

```bash
npx cdk destroy CdkdServerlessCfn \
  --profile "$AWS_PROFILE" \
  --force

npx cdkd destroy CdkdServerlessDirect \
  --profile "$AWS_PROFILE" \
  --purge-events \
  --yes
```

Verify the CloudFormation stack is gone and `cdkd state list` no longer contains `CdkdServerlessDirect`.

Do not delete the CDK bootstrap stack or cdkd state and asset buckets from a shared account just to clean up this POC.

## Run a Fair Comparison

The repository does not publish deployment numbers yet. No live AWS run has been completed for this version.

Use [the benchmark worksheet](./docs/BENCHMARK.md) to record cold deploys, one small configuration update, smoke-test success, and destroy time for both engines. Publish the raw values, not only the fastest run.

The upstream project reports much larger benchmark campaigns. Those are the project's measurements, not mine. See the [cdkd benchmark documentation](https://github.com/go-to-k/cdkd/blob/main/docs/benchmarks.md).

## Current Dependency Audit Caveat

On 2026-08-11, the pinned install reports three high-severity npm findings across two denial-of-service advisories:

- `adm-zip` through `@go-to-k/cdkd`
- `brace-expansion` bundled inside `aws-cdk-lib`

This POC does not accept untrusted ZIP files or glob patterns, but the install is not audit-clean. Dependabot is enabled, and these findings should be rechecked before every live test.

- [GHSA-xcpc-8h2w-3j85](https://github.com/advisories/GHSA-xcpc-8h2w-3j85)
- [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895)

## My Current Boundary

```txt
Disposable development environments -> cdkd
Shared staging and production        -> CDK + CloudFormation
```

Drop-in compatible does not mean operationally identical.

That is the part this POC is meant to test honestly.
