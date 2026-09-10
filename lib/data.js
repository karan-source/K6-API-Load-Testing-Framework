import { SharedArray } from 'k6/data';
import { testConfig } from './config.js';

// SharedArray keeps one copy in memory regardless of VU count.
export const saveRequests = new SharedArray('save-requests', () =>
  JSON.parse(open('../payloads/save-requests.json'))
);

export const customerRefs = new SharedArray('customer-refs', () =>
  JSON.parse(open('../payloads/customer-refs.json'))
);

function selectableSize(length) {
  const limit = testConfig.hotRows;
  return limit > 0 ? Math.min(limit, length) : length;
}

/**
 * Picks the next item for this iteration. Sequential mode spreads VUs deterministically so a
 * run is reproducible; random mode is closer to real traffic.
 */
export function pick(collection) {
  const size = selectableSize(collection.length);

  const index =
    testConfig.dataMode === 'random'
      ? Math.floor(Math.random() * size)
      : (__VU + __ITER) % size;

  return collection[index];
}

export function randomThinkTime() {
  const { min, max } = testConfig.thinkTime;
  return min + Math.random() * (max - min);
}

/** Builds one save body, assigning this VU to one of the API's two code paths. */
export function buildSavePayload() {
  const payload = Object.assign({}, pick(saveRequests));

  if (testConfig.alternateSyncPath) {
    payload.triggersExternalSync = __VU % 2 === 0;
  }

  return payload;
}
