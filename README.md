# k6 API Load Testing Framework

[![Load Test](https://github.com/karan-source/K6-API-Load-Testing-Framework/actions/workflows/load-test.yml/badge.svg)](https://github.com/karan-source/K6-API-Load-Testing-Framework/actions/workflows/load-test.yml)

A config-driven [k6](https://k6.io) framework that load-tests two implementations of the same
API endpoint side by side and reports which one holds up.

The target is the [Entity Framework Core Save Optimization](https://github.com/karan-source/Entity-Framework-Core-Save-Optimization)
API — a .NET 8 service that deliberately exposes an unoptimized and an optimized version of the same
save operation. Running both under identical load turns "we optimized it" into a number.

## Table of Contents

- [Headline result](#headline-result)
- [Framework structure](#framework-structure)
- [Prerequisites](#prerequisites)
- [Test profiles](#test-profiles)
- [Scenarios and custom metrics](#scenarios-and-custom-metrics)
- [Thresholds](#thresholds)
- [Running tests](#running-tests)
- [Continuous integration](#continuous-integration)
- [Environment variables](#environment-variables)
- [Design notes](#design-notes)

## Headline result

`contention` profile — 16 VUs per implementation, all competing for a single database row, 1 minute:

```
  NAIVE vs OPTIMIZED
  --------------------------------------------------------------
  Metric                             NAIVE         OPTIMIZED
  --------------------------------------------------------------
  Requests                            1618              6579
  Succeeded                           1289              6579
  Failed                               329                 0
  Avg DB round-trips                  11.6               4.0
  p95 duration (ms)                   1649               617
  --------------------------------------------------------------
  Deadlocks observed: 329   Retries: 0
```

The optimized endpoint served **4x the throughput with zero failures**. But the finding that
matters most is this line from the same run:

```
http_req_failed................: 0.00%  ✓ 0  ✗ 8199
```

**Every one of those 329 discarded saves returned HTTP 200.** The API catches the deadlock, swallows
it, and answers with a success-shaped body containing `"success": false`. A load test that only
asserts on status codes would have declared this run perfectly healthy while a fifth of all writes
vanished.

That is why `lib/http.js` judges success from the response body:

```js
const succeeded = res.status === 200 && body !== null && body.success === true;
```

## Framework structure

```
K6-API-Load-Testing-Framework/
├── save-comparison-load-test.js   # Entry point: options, setup, scenario exports, summary
├── run-tests.ps1                  # PowerShell runner with preflight checks
├── config/
│   └── config.json                # Profiles, scenario toggles, thresholds
├── payloads/
│   ├── save-requests.json         # Request bodies, loaded once via SharedArray
│   └── customer-refs.json         # References for the read scenario
├── lib/
│   ├── config.js                  # Resolves profile + env overrides, builds k6 options
│   ├── data.js                    # SharedArray loaders, sequential/random selection
│   ├── http.js                    # Request helpers and body-level success evaluation
│   ├── metrics.js                 # Custom Trend/Counter/Rate definitions
│   └── setup.js                   # Seeds the database and validates payloads
├── scenarios/
│   ├── naive-save.js
│   ├── optimized-save.js
│   └── read-customer.js
└── reports/                       # HTML + JSON output (gitignored)
```

## Prerequisites

- **k6** — `winget install k6`, then verify with `k6 version`
- **The SaveLab API running**, with SQL Server LocalDB behind it:

  ```powershell
  git clone https://github.com/karan-source/Entity-Framework-Core-Save-Optimization
  cd Entity-Framework-Core-Save-Optimization
  dotnet run --project src/SaveLab.Api
  ```

No credentials, tokens, or cloud resources are needed — everything runs locally.

## Test profiles

Defined in [config/config.json](config/config.json). Each profile sets its own VU counts,
duration, think time and thresholds.

| Profile | Naive VUs | Optimized VUs | Duration | Think time | Purpose |
|---|---|---|---|---|---|
| **smoke** | 1 | 1 | 30s | 1-2s | Validate every endpoint responds |
| **load** | 10 | 10 | 2m | 0.5-1s | Expected production load |
| **stress** | ramp to 40 | ramp to 40 | 4m | 0.2-0.5s | Find the breaking point |
| **soak** | 5 | 5 | 20m | 1-3s | Look for drift and leaks |
| **contention** | 16 | 16 | 1m | 0-0.1s | Force the deadlock (1 hot row) |

The `readCustomer` scenario is disabled by default
(`testConfig.scenarios.readCustomer.enabled: false`). Enable it to compare the read paths.

## Scenarios and custom metrics

Scenarios run **concurrently**, each with its own VUs, tags and metrics, so the two
implementations compete for the same database at the same time.

| Metric | Type | Meaning |
|---|---|---|
| `naive_save_duration` / `optimized_save_duration` | Trend | Response time per implementation |
| `naive_save_db_queries` / `optimized_save_db_queries` | Trend | **Database round-trips**, read from the response body |
| `naive_save_requests` / `optimized_save_requests` | Counter | Request counts |
| `successful_*` / `failed_*` | Counter | Outcomes judged from the response body |
| `deadlocks_observed` | Counter | Saves abandoned to a SQL Server 1205 deadlock |
| `deadlock_retries` | Counter | Retries the optimized path used to recover |
| `empty_preference_names` | Counter | Responses where eager loading silently failed |
| `errors` | Rate | Overall error rate |

`*_db_queries` is the metric worth stealing. The API reports how many round-trips each request
cost, so the framework measures **work done**, not just time taken — and unlike latency, it
does not move when the machine is busy.

## Thresholds

Thresholds encode the claim the optimization makes, so a regression fails the run (k6 exits
non-zero). From the `load` profile:

```json
"thresholds": {
  "errors": ["rate<0.05"],
  "optimized_save_duration": ["p(95)<500", "p(99)<1500"],
  "optimized_save_db_queries": ["avg<6"],
  "successful_optimized_saves": ["count>0"]
}
```

The naive path has no thresholds on purpose — it is the control, and it is expected to fail.

## Running tests

### PowerShell runner (recommended)

Checks that k6 is installed and the API is reachable before starting, then surfaces the report path:

```powershell
.\run-tests.ps1 -Profile smoke
.\run-tests.ps1 -Profile load -DataMode random
.\run-tests.ps1 -Profile contention -OpenReport
.\run-tests.ps1 -Profile load -Scenario optimizedSave -Verbose
```

### k6 directly

```powershell
k6 run -e TEST_PROFILE=smoke save-comparison-load-test.js
k6 run -e TEST_PROFILE=contention -e VERBOSE=true save-comparison-load-test.js
k6 run -e TEST_PROFILE=load -e BASE_URL=http://localhost:5181 --out json=reports/raw.json save-comparison-load-test.js
```

Every run writes a timestamped HTML and JSON report into `reports/`.

## Continuous integration

[.github/workflows/load-test.yml](.github/workflows/load-test.yml) runs the whole thing on every
push and pull request, with no local setup:

1. Starts SQL Server 2022 as a service container and waits for it to pass a health check
2. Checks out the target API repository alongside this one
3. Builds and starts the API against the containerised database
4. Polls the Swagger endpoint until the API answers
5. Installs k6 and runs the `smoke` profile
6. Uploads the HTML and JSON reports as build artifacts

The job fails when a threshold is breached, so a performance regression breaks the build the same
way a failing unit test would.

Use **Run workflow** to run a heavier profile on demand:

| Input | Options |
|---|---|
| `profile` | `smoke`, `load`, `stress`, `contention` |
| `data_mode` | `sequential`, `random` |

The SQL Server SA password comes from the `SA_PASSWORD` repository secret. The credential itself is
ephemeral - it is created and destroyed with the service container and is valid nowhere else - but
keeping it out of the workflow file avoids a plaintext password that secret scanners cannot tell
apart from a real one.

To run this workflow on a fork, add a repository secret named `SA_PASSWORD` under
**Settings > Secrets and variables > Actions**. It must satisfy the SQL Server password policy (at
least 8 characters, mixing upper case, lower case, and digits or symbols) and must not contain a
single quote, which would break the container health check.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TEST_PROFILE` | `smoke` | `smoke` / `load` / `stress` / `soak` / `contention` |
| `BASE_URL` | `http://localhost:5181` | SaveLab API base URL |
| `DATA_MODE` | `sequential` | `sequential` (reproducible) or `random` |
| `SCENARIO` | *(all enabled)* | Run one scenario only |
| `HOT_ROWS` | `0` | Limit to N rows to concentrate contention; 0 uses all |
| `SEED_CUSTOMERS` | `25` | Customers created during setup |
| `ALTERNATE_SYNC_PATH` | `true` | Split VUs across the API's two code paths |
| `READ_MODE` | `optimized` | `naive` or `optimized` for the read scenario |
| `VERBOSE` | `false` | Log every failed request |

## Design notes

**Success is judged from the response body.** See the headline result — status codes alone would
have missed every failure in this system.

**`ALTERNATE_SYNC_PATH` exists because the first version of this framework found no deadlocks.**
The API has two code paths that lock the same two rows in opposite orders. Pinning all VUs to one
payload meant every request took the *same* path, the same lock order, and nothing ever collided.
Splitting VUs across both paths (`__VU % 2`) reproduced 329 deadlocks in a one-minute run. A load
test that exercises only one branch of a system will confidently tell you it has no concurrency
bugs.

**Setup validates before it measures.** `lib/setup.js` reseeds the database, then sends one save
and aborts with a clear message if it is rejected — a mismatch between the payload files and the
seeded data would otherwise produce a full run of meaningless failures.

**Data selection is reproducible by default.** `sequential` mode indexes by `__VU + __ITER`, so
two runs of the same profile hit the same rows in the same order. `random` is available when
realistic traffic matters more than comparability.

**Config over code.** VU counts, durations, think time, thresholds and scenario toggles all live
in `config/config.json`. Adding a profile requires no JavaScript.
