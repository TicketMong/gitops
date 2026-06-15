function emit(event, fields) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    test_type: 'loadtest',
    ...fields,
  }));
}

export function logRunStarted(config) {
  emit('loadtest_run_started', {
    loadtest_run_id: config.runId,
    scenario: config.scenario,
    target: config.target,
    target_base_url: config.baseUrl,
    vus: config.vus,
    duration: config.duration,
  });
}

export function logStep(config, step, response, extra = {}) {
  emit('loadtest_step', {
    loadtest_run_id: config.runId,
    scenario: config.scenario,
    step,
    target: config.target,
    target_base_url: config.baseUrl,
    http_status: response.status,
    request_id: response.headers['X-Request-Id'] || response.headers['x-request-id'] || config.requestIdBase,
    ...extra,
  });
}

export function logRunFinished(config, state = {}) {
  emit('loadtest_run_finished', {
    loadtest_run_id: config.runId,
    scenario: config.scenario,
    target: config.target,
    target_base_url: config.baseUrl,
    concert_id: state.concertId,
    performance_id: state.performanceId,
    seat_count: state.seatCount,
  });
}

export function logRunFailed(config, step, error, state = {}) {
  emit('loadtest_run_failed', {
    loadtest_run_id: config.runId,
    scenario: config.scenario,
    step,
    target: config.target,
    target_base_url: config.baseUrl,
    error_message: error && error.message ? error.message : String(error),
    request_id: config.requestIdBase,
    concert_id: state.concertId,
    performance_id: state.performanceId,
  });
}

export function logDatasetFinished(config, state = {}) {
  emit('loadtest_dataset_finished', {
    loadtest_run_id: config.runId,
    scenario: config.scenario,
    target: config.target,
    target_base_url: config.baseUrl,
    profile: config.dataset.profile,
    revision: config.dataset.revision,
    desired_concerts: config.dataset.concerts,
    desired_performances_per_concert: config.dataset.performancesPerConcert,
    desired_seats_per_performance: config.dataset.seatSections * config.dataset.seatRows * config.dataset.seatsPerRow,
    created_concerts: state.createdConcerts || 0,
    reused_concerts: state.reusedConcerts || 0,
    created_performances: state.createdPerformances || 0,
    verified_concerts: state.verifiedConcerts || 0,
  });
}

function metricValue(metrics, name, key) {
  const metric = metrics && metrics[name];
  if (!metric || !metric.values) {
    return null;
  }
  return metric.values[key] === undefined ? null : metric.values[key];
}

export function summaryLine(data) {
  const metrics = data.metrics || {};
  return JSON.stringify({
    event: 'loadtest_summary',
    timestamp: new Date().toISOString(),
    test_type: 'loadtest',
    scenario: __ENV.LOADTEST_SCENARIO || 'read-api-baseline',
    target: __ENV.LOADTEST_TARGET || 'local',
    http_req_duration_p95_ms: metricValue(metrics, 'http_req_duration', 'p(95)'),
    http_req_duration_p99_ms: metricValue(metrics, 'http_req_duration', 'p(99)'),
    http_req_failed_rate: metricValue(metrics, 'http_req_failed', 'rate'),
    http_reqs_rate: metricValue(metrics, 'http_reqs', 'rate'),
    checks_rate: metricValue(metrics, 'checks', 'rate'),
    iterations: metricValue(metrics, 'iterations', 'count'),
    vus_max: metricValue(metrics, 'vus_max', 'value'),
  });
}
