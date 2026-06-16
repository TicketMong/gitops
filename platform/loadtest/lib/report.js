import { summaryLine } from './log.js';

function metricValue(metrics, name, key) {
  const metric = metrics && metrics[name];
  if (!metric || !metric.values || metric.values[key] === undefined) {
    return null;
  }
  return metric.values[key];
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return Number(value).toFixed(digits);
}

function formatRate(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function thresholdRows(data) {
  const rows = [];
  for (const [metricName, metric] of Object.entries(data.metrics || {})) {
    for (const [expression, threshold] of Object.entries(metric.thresholds || {})) {
      rows.push({
        metric: metricName,
        expression,
        ok: threshold.ok === undefined ? null : threshold.ok,
      });
    }
  }
  return rows;
}

function reportStatus(rows) {
  if (rows.some((row) => row.ok === false)) {
    return 'FAIL';
  }
  if (rows.length === 0 || rows.some((row) => row.ok === null)) {
    return 'WARN';
  }
  return 'PASS';
}

function reportSummary(data) {
  const metrics = data.metrics || {};
  const thresholds = thresholdRows(data);
  return {
    status: reportStatus(thresholds),
    thresholds,
    http_req_duration_p95_ms: metricValue(metrics, 'http_req_duration', 'p(95)'),
    http_req_duration_p99_ms: metricValue(metrics, 'http_req_duration', 'p(99)'),
    http_req_failed_rate: metricValue(metrics, 'http_req_failed', 'rate'),
    checks_pass_rate: metricValue(metrics, 'checks', 'rate'),
    http_reqs_rate: metricValue(metrics, 'http_reqs', 'rate'),
    iterations_count: metricValue(metrics, 'iterations', 'count'),
    iterations_rate: metricValue(metrics, 'iterations', 'rate'),
  };
}

function metadata(config) {
  return {
    run_id: config.runId,
    scenario: config.scenario,
    environment: config.environment,
    base_url: config.baseUrl,
    vus: config.vus,
    duration: config.duration,
    git_sha: config.gitSha,
    started_at: config.startedAt,
    finished_at: new Date().toISOString(),
  };
}

function markdownReport(config, data) {
  const meta = metadata(config);
  const result = reportSummary(data);
  const thresholdLines = result.thresholds.length === 0
    ? ['- WARN n/a']
    : result.thresholds.map((row) => {
      const status = row.ok === false ? 'FAIL' : row.ok === null ? 'WARN' : 'PASS';
      return `- ${status} ${row.metric} ${row.expression}`;
    });

  return [
    `# Loadtest Report: ${meta.run_id}`,
    '',
    `Status: ${result.status}`,
    '',
    '## Metadata',
    '',
    `- scenario: ${meta.scenario}`,
    `- environment: ${meta.environment}`,
    `- base_url: ${meta.base_url}`,
    `- vus: ${meta.vus}`,
    `- duration: ${meta.duration}`,
    `- git_sha: ${meta.git_sha}`,
    `- started_at: ${meta.started_at}`,
    `- finished_at: ${meta.finished_at}`,
    '',
    '## Quick Metrics',
    '',
    `- p95 latency: ${formatNumber(result.http_req_duration_p95_ms)} ms`,
    `- p99 latency: ${formatNumber(result.http_req_duration_p99_ms)} ms`,
    `- error rate: ${formatRate(result.http_req_failed_rate)}`,
    `- checks pass rate: ${formatRate(result.checks_pass_rate)}`,
    `- RPS: ${formatNumber(result.http_reqs_rate)}`,
    `- iterations: ${formatNumber(result.iterations_count, 0)} (${formatNumber(result.iterations_rate)}/s)`,
    '',
    '## Thresholds',
    '',
    ...thresholdLines,
    '',
  ].join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlReport(config, data) {
  const meta = metadata(config);
  const result = reportSummary(data);
  const thresholdRowsHtml = result.thresholds.map((row) => {
    const status = row.ok === false ? 'FAIL' : row.ok === null ? 'WARN' : 'PASS';
    return `<tr><td>${escapeHtml(row.metric)}</td><td>${escapeHtml(row.expression)}</td><td>${status}</td></tr>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Loadtest Report ${escapeHtml(meta.run_id)}</title>
  <style>
    body { color: #202124; font-family: ui-sans-serif, system-ui, sans-serif; margin: 40px; max-width: 960px; }
    h1, h2 { margin-bottom: 8px; }
    .status { display: inline-block; font-weight: 700; padding: 6px 10px; border: 1px solid #202124; }
    dl { display: grid; grid-template-columns: 160px 1fr; gap: 6px 14px; }
    dt { color: #5f6368; }
    dd { margin: 0; }
    table { border-collapse: collapse; margin-top: 12px; width: 100%; }
    th, td { border-bottom: 1px solid #dadce0; padding: 8px; text-align: left; }
  </style>
</head>
<body>
  <h1>Loadtest Report</h1>
  <p class="status">${escapeHtml(result.status)}</p>
  <h2>Metadata</h2>
  <dl>
    <dt>run_id</dt><dd>${escapeHtml(meta.run_id)}</dd>
    <dt>scenario</dt><dd>${escapeHtml(meta.scenario)}</dd>
    <dt>environment</dt><dd>${escapeHtml(meta.environment)}</dd>
    <dt>base_url</dt><dd>${escapeHtml(meta.base_url)}</dd>
    <dt>vus</dt><dd>${escapeHtml(meta.vus)}</dd>
    <dt>duration</dt><dd>${escapeHtml(meta.duration)}</dd>
    <dt>git_sha</dt><dd>${escapeHtml(meta.git_sha)}</dd>
    <dt>started_at</dt><dd>${escapeHtml(meta.started_at)}</dd>
    <dt>finished_at</dt><dd>${escapeHtml(meta.finished_at)}</dd>
  </dl>
  <h2>Quick Metrics</h2>
  <dl>
    <dt>p95 latency</dt><dd>${escapeHtml(formatNumber(result.http_req_duration_p95_ms))} ms</dd>
    <dt>p99 latency</dt><dd>${escapeHtml(formatNumber(result.http_req_duration_p99_ms))} ms</dd>
    <dt>error rate</dt><dd>${escapeHtml(formatRate(result.http_req_failed_rate))}</dd>
    <dt>checks pass rate</dt><dd>${escapeHtml(formatRate(result.checks_pass_rate))}</dd>
    <dt>RPS</dt><dd>${escapeHtml(formatNumber(result.http_reqs_rate))}</dd>
    <dt>iterations</dt><dd>${escapeHtml(formatNumber(result.iterations_count, 0))} (${escapeHtml(formatNumber(result.iterations_rate))}/s)</dd>
  </dl>
  <h2>Thresholds</h2>
  <table>
    <thead><tr><th>Metric</th><th>Threshold</th><th>Status</th></tr></thead>
    <tbody>${thresholdRowsHtml || '<tr><td colspan="3">WARN n/a</td></tr>'}</tbody>
  </table>
</body>
</html>
`;
}

export function summaryOutput(config, data) {
  const output = {
    stdout: `${summaryLine(data)}\n`,
  };
  if (!config.reportDir) {
    return output;
  }
  return {
    ...output,
    [`${config.reportDir}/metadata.json`]: JSON.stringify(metadata(config), null, 2),
    [`${config.reportDir}/summary.json`]: JSON.stringify(data, null, 2),
    [`${config.reportDir}/report.md`]: markdownReport(config, data),
    [`${config.reportDir}/report.html`]: htmlReport(config, data),
  };
}
