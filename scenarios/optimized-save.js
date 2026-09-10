import { sleep } from 'k6';
import { endpointFor } from '../lib/config.js';
import { buildSavePayload, randomThinkTime } from '../lib/data.js';
import { postSave, recordSave } from '../lib/http.js';
import {
  failedOptimizedSaves,
  optimizedSaveDbQueries,
  optimizedSaveDuration,
  optimizedSaveRequests,
  successfulOptimizedSaves,
} from '../lib/metrics.js';

const endpoint = endpointFor('optimizedSave');

export function optimizedSave() {
  const payload = buildSavePayload();
  const response = postSave(endpoint, payload, { endpoint: 'optimized_save' });

  recordSave(response, 'optimized save', {
    requests: optimizedSaveRequests,
    duration: optimizedSaveDuration,
    dbQueries: optimizedSaveDbQueries,
    successes: successfulOptimizedSaves,
    failures: failedOptimizedSaves,
  });

  sleep(randomThinkTime());
}
