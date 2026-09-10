// Resolves the active profile from config.json, applying environment-variable overrides,
// and builds the k6 options object.

const config = JSON.parse(open('../config/config.json'));

const profileName = (__ENV.TEST_PROFILE || 'smoke').toLowerCase();
const profile = config.profiles[profileName];

if (!profile) {
  throw new Error(
    `Unknown TEST_PROFILE "${profileName}". Available: ${Object.keys(config.profiles).join(', ')}`
  );
}

// A single scenario can be isolated without editing config.json.
const onlyScenario = __ENV.SCENARIO || null;

function trimTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

export const testConfig = {
  profileName,
  profileDescription: profile.description,
  baseUrl: trimTrailingSlash(__ENV.BASE_URL || config.testConfig.baseUrl),
  seedCustomers: Number(__ENV.SEED_CUSTOMERS || config.testConfig.seedCustomers),
  dataMode: (__ENV.DATA_MODE || config.testConfig.dataMode).toLowerCase(),
  thinkTime: profile.thinkTime || config.testConfig.thinkTime,

  // 0 means "spread across every row in the payload file". A low value concentrates
  // all VUs onto the same rows, which is what provokes lock contention.
  hotRows: Number(__ENV.HOT_ROWS || profile.hotRows || 0),

  // Half the VUs take each of the API's two code paths. Those paths lock the same two rows in
  // opposite orders, so without this every VU takes the same order and nothing ever deadlocks.
  alternateSyncPath: (__ENV.ALTERNATE_SYNC_PATH || 'true').toLowerCase() !== 'false',

  scenarios: config.testConfig.scenarios,
};

export function isScenarioEnabled(name) {
  const meta = config.testConfig.scenarios[name];
  if (!meta || meta.enabled === false) return false;

  return !onlyScenario || onlyScenario === name;
}

export function endpointFor(name) {
  return config.testConfig.scenarios[name].endpoint;
}

export function buildOptions() {
  const scenarios = {};

  for (const [name, definition] of Object.entries(profile.scenarios)) {
    if (!isScenarioEnabled(name)) continue;

    scenarios[`${name}_scenario`] = Object.assign({}, definition, {
      exec: name,
      tags: { scenario: name },
    });
  }

  if (Object.keys(scenarios).length === 0) {
    throw new Error(`No scenarios enabled for profile "${profileName}".`);
  }

  return {
    scenarios,
    thresholds: profile.thresholds || {},
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    discardResponseBodies: false,
  };
}
