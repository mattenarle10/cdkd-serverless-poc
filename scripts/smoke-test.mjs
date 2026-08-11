const apiUrl = process.env.API_URL?.replace(/\/$/, '');
if (!apiUrl) {
  throw new Error('API_URL is required.');
}

const input = `cdkd smoke test ${Date.now()}`;
const expected = input.toUpperCase();

const healthResponse = await fetch(`${apiUrl}/health`);
assertStatus(healthResponse, 200, 'health check');
const health = await healthResponse.json();
console.log(`Health check passed. Version: ${health.version}`);

const createResponse = await fetch(`${apiUrl}/jobs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: input }),
});
assertStatus(createResponse, 202, 'job creation');
const created = await createResponse.json();
console.log(`Created job ${created.jobId}.`);

for (let attempt = 1; attempt <= 30; attempt += 1) {
  const response = await fetch(`${apiUrl}/jobs/${created.jobId}`);
  assertStatus(response, 200, 'job lookup');
  const job = await response.json();

  if (job.status === 'COMPLETED') {
    if (job.result !== expected) {
      throw new Error(`Unexpected result: ${job.result}`);
    }

    console.log(`Job completed after ${attempt} poll(s): ${job.result}`);
    process.exit(0);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

throw new Error('Job did not complete within 30 seconds.');

function assertStatus(response, expectedStatus, operation) {
  if (response.status !== expectedStatus) {
    throw new Error(`${operation} returned ${response.status}; expected ${expectedStatus}.`);
  }
}

