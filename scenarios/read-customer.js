import http from 'k6/http';
import { check, sleep } from 'k6';
import { testConfig } from '../lib/config.js';
import { customerRefs, pick, randomThinkTime } from '../lib/data.js';
import { parseBody } from '../lib/http.js';
import {
  emptyPreferenceNames,
  errorRate,
  readCustomerDbQueries,
  readCustomerDuration,
  readCustomerRequests,
} from '../lib/metrics.js';

const mode = __ENV.READ_MODE || 'optimized';

export function readCustomer() {
  const customerRef = pick(customerRefs);
  const response = http.get(`${testConfig.baseUrl}/api/saves/${customerRef}?mode=${mode}`, {
    tags: { endpoint: 'read_customer' },
  });

  const body = parseBody(response);
  const ok = response.status === 200 && body !== null;

  // Naive mode omits the Include, so preferences come back with blank names and a zero
  // display order. The request still succeeds - only the payload is wrong.
  const preferencesPopulated =
    ok && Array.isArray(body.preferences) && body.preferences.every((p) => p.name !== '');

  check(response, {
    'read customer: HTTP 200': (r) => r.status === 200,
    'read customer: preference names populated': () => preferencesPopulated,
  });

  readCustomerRequests.add(1);
  readCustomerDuration.add(response.timings.duration);
  errorRate.add(!ok);

  if (ok) {
    if (typeof body.queryCount === 'number') readCustomerDbQueries.add(body.queryCount);
    if (!preferencesPopulated) emptyPreferenceNames.add(1);
  }

  sleep(randomThinkTime());
}
