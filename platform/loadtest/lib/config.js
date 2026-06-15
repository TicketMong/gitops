function optional(name, fallback = '') {
  const value = __ENV[name];
  return value === undefined || value === null || value === '' ? fallback : value;
}

function required(name) {
  const value = optional(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveNumber(name, fallback) {
  const raw = optional(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function positiveInteger(name, fallback) {
  const value = positiveNumber(name, fallback);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function nonNegativeInteger(name, fallback) {
  const raw = optional(name, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function rate(name, fallback) {
  const value = positiveNumber(name, fallback);
  if (value >= 1) {
    throw new Error(`${name} must be lower than 1`);
  }
  return value;
}

function baseUrlForTarget(target) {
  if (target === 'local') {
    return optional('LOADTEST_LOCAL_BASE_URL', required('LOADTEST_BASE_URL'));
  }
  if (target === 'aws') {
    return optional('LOADTEST_AWS_BASE_URL', required('LOADTEST_BASE_URL'));
  }
  return required('LOADTEST_BASE_URL');
}

export function getConfig() {
  const target = optional('LOADTEST_TARGET', 'local');
  const scenario = optional('LOADTEST_SCENARIO', 'read-api-baseline');
  const requestPrefix = optional('LOADTEST_REQUEST_PREFIX', 'loadtest');
  const runId = optional('LOADTEST_RUN_ID', `${Date.now()}`);
  const baseUrl = baseUrlForTarget(target).replace(/\/+$/, '');

  return {
    testType: optional('LOADTEST_TEST_TYPE', 'loadtest'),
    scenario,
    target,
    runId,
    baseUrl,
    requestPrefix,
    requestIdBase: `${requestPrefix}-${scenario}-${runId}`,
    timeoutSeconds: positiveNumber('LOADTEST_TIMEOUT_SECONDS', 10),
    vus: positiveInteger('LOADTEST_VUS', 5),
    duration: optional('LOADTEST_DURATION', '2m'),
    gracefulStop: optional('LOADTEST_GRACEFUL_STOP', '30s'),
    concertLimit: positiveInteger('LOADTEST_CONCERT_LIMIT', 50),
    performanceLimit: positiveInteger('LOADTEST_PERFORMANCE_LIMIT', 50),
    seatLimit: positiveInteger('LOADTEST_SEAT_LIMIT', 200),
    thresholds: {
      httpReqFailedRate: rate('LOADTEST_THRESHOLD_HTTP_REQ_FAILED_RATE', 0.01),
      httpReqDurationP95Ms: positiveNumber('LOADTEST_THRESHOLD_HTTP_REQ_DURATION_P95_MS', 500),
      httpReqDurationP99Ms: positiveNumber('LOADTEST_THRESHOLD_HTTP_REQ_DURATION_P99_MS', 1000),
      checksRate: rate('LOADTEST_THRESHOLD_CHECKS_RATE', 0.99),
    },
    dataset: {
      profile: optional('LOADTEST_DATASET_PROFILE', 'read-api-basic'),
      revision: optional('LOADTEST_DATASET_REVISION', 'v1'),
      titlePrefix: optional('LOADTEST_DATASET_TITLE_PREFIX', 'Medikong Loadtest'),
      venuePrefix: optional('LOADTEST_DATASET_VENUE_PREFIX', 'Loadtest Hall'),
      concerts: positiveInteger('LOADTEST_DATASET_CONCERTS', 20),
      performancesPerConcert: positiveInteger('LOADTEST_DATASET_PERFORMANCES_PER_CONCERT', 2),
      seatSections: positiveInteger('LOADTEST_DATASET_SEAT_SECTIONS', 1),
      seatRows: positiveInteger('LOADTEST_DATASET_SEAT_ROWS', 10),
      seatsPerRow: positiveInteger('LOADTEST_DATASET_SEATS_PER_ROW', 30),
      lookaheadDays: nonNegativeInteger('LOADTEST_DATASET_LOOKAHEAD_DAYS', 14),
      startsAtSpacingMinutes: positiveInteger('LOADTEST_DATASET_STARTS_AT_SPACING_MINUTES', 180),
      discoveryLimit: positiveInteger('LOADTEST_DATASET_DISCOVERY_LIMIT', 200),
      providerEmail: optional('LOADTEST_PROVIDER_EMAIL'),
      providerPassword: optional('LOADTEST_PROVIDER_PASSWORD'),
      adminEmail: optional('LOADTEST_ADMIN_EMAIL'),
      adminPassword: optional('LOADTEST_ADMIN_PASSWORD'),
    },
  };
}

export function requireDatasetCredentials(config) {
  const missing = [
    ['LOADTEST_PROVIDER_EMAIL', config.dataset.providerEmail],
    ['LOADTEST_PROVIDER_PASSWORD', config.dataset.providerPassword],
    ['LOADTEST_ADMIN_EMAIL', config.dataset.adminEmail],
    ['LOADTEST_ADMIN_PASSWORD', config.dataset.adminPassword],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} required for loadtest dataset setup`);
  }
}
