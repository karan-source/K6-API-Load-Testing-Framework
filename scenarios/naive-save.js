import { sleep } from 'k6';
import { endpointFor } from '../lib/config.js';
import { buildSavePayload, randomThinkTime } from '../lib/data.js';
import { postSave, recordSave } from '../lib/http.js';
import {
  failedNaiveSaves,
  naiveSaveDbQueries,
  naiveSaveDuration,
  naiveSaveRequests,
  successfulNaiveSaves,
} from '../lib/metrics.js';

const endpoint = endpointFor('naiveSave');

export function naiveSave() {
  const payload = buildSavePayload();
  const response = postSave(endpoint, payload, { endpoint: 'naive_save' });

  recordSave(response, 'naive save', {
    requests: naiveSaveRequests,
    duration: naiveSaveDuration,
    dbQueries: naiveSaveDbQueries,
    successes: successfulNaiveSaves,
    failures: failedNaiveSaves,
  });

  sleep(randomThinkTime());
}
