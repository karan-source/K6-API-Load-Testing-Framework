import { Counter, Rate, Trend } from 'k6/metrics';

// Overall error rate across every scenario.
export const errorRate = new Rate('errors');

// Response time, per implementation.
export const naiveSaveDuration = new Trend('naive_save_duration', true);
export const optimizedSaveDuration = new Trend('optimized_save_duration', true);
export const readCustomerDuration = new Trend('read_customer_duration', true);

// Database round-trips the API reports for each request. This is the metric that makes the
// comparison concrete: it measures work done, not just time taken.
export const naiveSaveDbQueries = new Trend('naive_save_db_queries');
export const optimizedSaveDbQueries = new Trend('optimized_save_db_queries');
export const readCustomerDbQueries = new Trend('read_customer_db_queries');

export const naiveSaveRequests = new Counter('naive_save_requests');
export const optimizedSaveRequests = new Counter('optimized_save_requests');
export const readCustomerRequests = new Counter('read_customer_requests');

export const successfulNaiveSaves = new Counter('successful_naive_saves');
export const failedNaiveSaves = new Counter('failed_naive_saves');
export const successfulOptimizedSaves = new Counter('successful_optimized_saves');
export const failedOptimizedSaves = new Counter('failed_optimized_saves');

// Business-level failures the HTTP status code cannot show: the API answers 200 OK even when
// the save was abandoned because of a deadlock.
export const deadlocksObserved = new Counter('deadlocks_observed');
export const deadlockRetries = new Counter('deadlock_retries');

// Counts responses where preference names came back empty - the missing-Include bug.
export const emptyPreferenceNames = new Counter('empty_preference_names');
