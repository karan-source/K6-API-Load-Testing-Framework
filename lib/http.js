import http from 'k6/http';
import { check } from 'k6';
import { testConfig } from './config.js';
import { deadlockRetries, deadlocksObserved, errorRate } from './metrics.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function postSave(endpoint, payload, tags) {
  return http.post(`${testConfig.baseUrl}${endpoint}`, JSON.stringify(payload), {
    headers: JSON_HEADERS,
    tags,
  });
}

export function parseBody(res) {
  try {
    return res.json();
  } catch (error) {
    return null;
  }
}

/**
 * Records one save. Success is deliberately judged from the response body, not the status code:
 * the API answers 200 OK even when the save was abandoned, so an HTTP-only check would report a
 * perfectly healthy run while every write was being discarded.
 */
export function recordSave(res, label, metrics) {
  const body = parseBody(res);
  const succeeded = res.status === 200 && body !== null && body.success === true;

  check(res, {
    [`${label}: HTTP 200`]: (r) => r.status === 200,
    [`${label}: body reports success`]: () => succeeded,
  });

  metrics.requests.add(1);
  metrics.duration.add(res.timings.duration);
  errorRate.add(!succeeded);

  if (body) {
    if (typeof body.queryCount === 'number') metrics.dbQueries.add(body.queryCount);
    if (typeof body.attempts === 'number' && body.attempts > 1) {
      deadlockRetries.add(body.attempts - 1);
    }
    if (body.wasDeadlock === true) deadlocksObserved.add(1);
  }

  if (succeeded) {
    metrics.successes.add(1);
  } else {
    metrics.failures.add(1);

    if (__ENV.VERBOSE === 'true') {
      const detail = body ? body.diagnostic || body.error : res.body;
      console.warn(`${label} failed (HTTP ${res.status}): ${detail}`);
    }
  }

  return succeeded;
}
