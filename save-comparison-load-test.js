import { buildOptions, testConfig } from './lib/config.js';
import { prepareEnvironment } from './lib/setup.js';
import { naiveSave as runNaiveSave } from './scenarios/naive-save.js';
import { optimizedSave as runOptimizedSave } from './scenarios/optimized-save.js';
import { readCustomer as runReadCustomer } from './scenarios/read-customer.js';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

export const options = buildOptions();

export function setup() {
  return prepareEnvironment();
}

// k6 resolves scenario `exec` names against this module's exports.
export function naiveSave() {
  runNaiveSave();
}

export function optimizedSave() {
  runOptimizedSave();
}

export function readCustomer() {
  runReadCustomer();
}

export function handleSummary(data) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `${testConfig.profileName}-${stamp}`;

  const output = {
    stdout: textSummary(data, { indent: '  ', enableColors: true }) + comparison(data),
    [`reports/${name}.html`]: htmlReport(data, { title: `SaveLab - ${testConfig.profileName}` }),
    [`reports/${name}.json`]: JSON.stringify(data, null, 2),
  };

  return output;
}

/** Prints the naive-versus-optimized comparison the standard summary cannot express. */
function comparison(data) {
  const value = (metric, stat) => {
    const found = data.metrics[metric];
    return found && found.values ? found.values[stat] : null;
  };

  // Counters are absent from the summary when nothing was recorded, so they read as zero.
  const count = (metric) => value(metric, 'count') || 0;

  const rows = [
    ['Requests', count('naive_save_requests'), count('optimized_save_requests'), 0],
    ['Succeeded', count('successful_naive_saves'), count('successful_optimized_saves'), 0],
    ['Failed', count('failed_naive_saves'), count('failed_optimized_saves'), 0],
    ['Avg DB round-trips', value('naive_save_db_queries', 'avg'), value('optimized_save_db_queries', 'avg'), 1],
    ['p95 duration (ms)', value('naive_save_duration', 'p(95)'), value('optimized_save_duration', 'p(95)'), 0],
    ['Max duration (ms)', value('naive_save_duration', 'max'), value('optimized_save_duration', 'max'), 0],
  ];

  if (count('naive_save_requests') === 0 && count('optimized_save_requests') === 0) return '';

  const format = (number, decimals) => (number === null ? '-' : number.toFixed(decimals));
  const line = '-'.repeat(62);

  let out = `\n\n  NAIVE vs OPTIMIZED\n  ${line}\n`;
  out += `  ${'Metric'.padEnd(24)}${'NAIVE'.padStart(16)}${'OPTIMIZED'.padStart(18)}\n  ${line}\n`;

  for (const [label, naive, optimized, decimals] of rows) {
    out += `  ${label.padEnd(24)}${format(naive, decimals).padStart(16)}${format(optimized, decimals).padStart(18)}\n`;
  }

  const deadlocks = value('deadlocks_observed', 'count') || 0;
  const retries = value('deadlock_retries', 'count') || 0;
  out += `  ${line}\n`;
  out += `  Deadlocks observed: ${deadlocks}   Retries: ${retries}\n`;

  return out;
}
