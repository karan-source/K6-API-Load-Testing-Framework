import http from 'k6/http';
import { fail } from 'k6';
import { testConfig } from './config.js';
import { saveRequests } from './data.js';
import { parseBody } from './http.js';

/**
 * Reseeds the database, then sends one save to confirm the payload files still line up with
 * the seeded data. Failing here is far cheaper than discovering it in the summary.
 */
export function prepareEnvironment() {
  const seedUrl = `${testConfig.baseUrl}/api/saves/seed?customers=${testConfig.seedCustomers}`;
  const seeded = http.post(seedUrl, null, { timeout: '180s' });

  if (seeded.status !== 200) {
    fail(
      `Seeding failed with HTTP ${seeded.status} at ${seedUrl}. ` +
        'Start the SaveLab API first, or point BASE_URL at a running instance.'
    );
  }

  const seedBody = parseBody(seeded);
  const probe = http.post(
    `${testConfig.baseUrl}/api/saves/optimized`,
    JSON.stringify(saveRequests[0]),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const probeBody = parseBody(probe);

  if (probe.status !== 200 || !probeBody || probeBody.success !== true) {
    const reason = probeBody ? probeBody.error : `HTTP ${probe.status}`;
    fail(
      `Warm-up save for ${saveRequests[0].customerRef} was rejected: ${reason}. ` +
        'Check that payloads/save-requests.json matches the seeded customers.'
    );
  }

  console.log(
    `Profile "${testConfig.profileName}" against ${testConfig.baseUrl} | ` +
      `seeded ${seedBody.seeded} customers | data mode ${testConfig.dataMode}` +
      (testConfig.hotRows > 0 ? ` | limited to ${testConfig.hotRows} hot row(s)` : '')
  );

  return { seeded: seedBody.seeded, startedAt: new Date().toISOString() };
}
