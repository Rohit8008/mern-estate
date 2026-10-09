/**
 * Discord alerts for the dev team — "something broke, come look."
 *
 * This is deliberately NOT the per-tenant webhook system (models/webhook.model.js),
 * which delivers business events to a customer's own endpoints. This is one
 * operator channel for errors and breakages across the whole deployment.
 *
 * It hangs off the ONE logger: `logger.error` already receives every 500
 * (globalErrorHandler + the access logger), every failed scheduled job, and the
 * process-level uncaughtException/unhandledRejection — so hooking that single
 * method captures "any error or breakage" without sprinkling calls everywhere.
 *
 * Design rules that keep it from becoming a liability:
 *   - OFF unless DISCORD_WEBHOOK_URL is set, and never in tests. No env, no-op.
 *   - It must NEVER throw into the caller and must NEVER import the logger
 *     (that would recurse: an alert failure would log an error would alert…).
 *     Its own failures go straight to stderr.
 *   - De-duped: an identical error collapses for DEDUP_MS and reports the
 *     suppressed count on the next send, so a 500 in a loop is one message, not
 *     a thousand.
 *   - Paced: sends are serialized with a min gap, so a burst cannot trip
 *     Discord's rate limit (~30/min per webhook).
 *   - Fed already-redacted fields by the logger, so no secrets/PII leave.
 */

import os from 'os';

// Read env at use, not at import: environment.js imports the logger (which
// imports this) BEFORE dotenv.config() runs, so a value captured here would see
// an empty environment and the alerter would be silently off. Same lesson the
// OpenObserve config in logger.js learned.
const webhookUrl = () => process.env.DISCORD_WEBHOOK_URL || '';
const isEnabled = () => !!webhookUrl() && (process.env.NODE_ENV || 'development') !== 'test';
const dedupMs = () => Number(process.env.DISCORD_ALERT_DEDUP_MS) || 5 * 60 * 1000;
const minGapMs = () => Number(process.env.DISCORD_ALERT_MIN_GAP_MS) || 1500;
const SEND_TIMEOUT_MS = 5000;

const HOST = os.hostname();
const INSTANCE_ID = process.env.NODE_APP_INSTANCE ?? process.env.pm_id ?? String(process.pid);
const APP_VERSION = process.env.APP_VERSION || 'dev';

const COLORS = { error: 0xe11d48, warn: 0xf59e0b, security: 0x7c3aed, fatal: 0x991b1b, info: 0x2563eb, success: 0x16a34a };
const ICONS = { error: '🔴', warn: '🟠', security: '🟣', fatal: '💥', info: '🔵', success: '✅' };

// signature -> { at: lastSentMs, suppressed: countSinceLastSend }
const recent = new Map();
let lastSentAt = 0;
let chain = Promise.resolve();
const inFlight = new Set();

const clip = (s, n) => {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
};

/** Group identical, recurring problems: level + title + the stable identifiers. */
function signatureOf(level, title, fields) {
  return [level, title, fields.code, fields.route || fields.url, fields.job].filter(Boolean).join('|');
}

/** The embed "fields" grid — identity first, then the request details. Bounded
 *  to an allowlist so only known-safe keys ever leave, and capped in count. */
function detailFields(fields) {
  // user_id and userId are the same thing from two sources (async context vs a
  // call that passed it explicitly); show it once.
  const merged = { ...fields };
  if (merged.user_id == null && merged.userId != null) merged.user_id = merged.userId;
  delete merged.userId;

  const pick = [
    // who — readable identifiers first, opaque ids after
    'email', 'user_name', 'name', 'role', 'tenant_name', 'tenant_slug',
    'user_id', 'tenant_id',
    // what / where
    'ip', 'method', 'status', 'reason', 'route', 'url', 'path', 'code', 'job', 'request_id', 'user_agent',
  ];
  const out = [];
  for (const key of pick) {
    const v = merged[key];
    if (v === undefined || v === null || v === '') continue;
    out.push({ name: key, value: clip(v, 180), inline: true });
  }
  const env = process.env.NODE_ENV || 'development';
  out.push({ name: 'where', value: clip(`${env} · ${HOST} · i${INSTANCE_ID} · v${APP_VERSION}`, 180), inline: false });
  return out.slice(0, 16);
}

/**
 * Queue one alert. `fields` must already be redacted by the caller (the logger
 * is). Safe to call from anywhere; returns immediately.
 */
export function alertDiscord(level, title, fields = {}) {
  if (!isEnabled()) return;
  try {
    const sig = signatureOf(level, title, fields);
    const now = Date.now();
    const seen = recent.get(sig);
    if (seen && now - seen.at < dedupMs()) {
      seen.suppressed += 1; // collapse the flood; reported on the next real send
      return;
    }
    const suppressed = seen ? seen.suppressed : 0;
    recent.set(sig, { at: now, suppressed: 0 });
    pruneRecent(now);
    enqueue(() => send(level, title, fields, suppressed));
  } catch (err) {
    process.stderr.write(`[discordAlert] enqueue failed: ${err?.message}\n`);
  }
}

/** Keep the dedup map from growing without bound on a long-lived process. */
function pruneRecent(now) {
  if (recent.size < 500) return;
  for (const [k, v] of recent) if (now - v.at > dedupMs()) recent.delete(k);
}

function enqueue(task) {
  chain = chain
    .then(async () => {
      const wait = minGapMs() - (Date.now() - lastSentAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastSentAt = Date.now();
      await task();
    })
    .catch((err) => process.stderr.write(`[discordAlert] send failed: ${err?.message}\n`));
}

async function send(level, title, fields, suppressed) {
  const description =
    clip(fields.message || fields.reason || '', 1600) +
    (fields.stack ? `\n\`\`\`\n${clip(fields.stack, 1200)}\n\`\`\`` : '') +
    (suppressed > 0 ? `\n\n_+${suppressed} more identical in the last ${Math.round(dedupMs() / 60000)}m_` : '');

  const embed = {
    title: clip(`${ICONS[level] || ICONS.error} ${title}`, 256),
    description: description || undefined,
    color: COLORS[level] ?? COLORS.error,
    fields: detailFields(fields),
    timestamp: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  const p = fetch(webhookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Real Vista Alerts', embeds: [embed] }),
    signal: controller.signal,
  })
    .then((res) => {
      // 429 = rate limited despite pacing; drop rather than hammer. The dedup
      // window means we are not losing distinct information for long.
      if (!res.ok && res.status !== 429) {
        process.stderr.write(`[discordAlert] Discord responded ${res.status}\n`);
      }
    })
    .catch((err) => process.stderr.write(`[discordAlert] request error: ${err?.name === 'AbortError' ? 'timeout' : err?.message}\n`))
    .finally(() => { clearTimeout(timer); inFlight.delete(p); });
  inFlight.add(p);
  await p;
}

/** Let the shutdown path (and crash handlers) drain pending sends before exit. */
export async function flushDiscordAlerts() {
  if (!isEnabled()) return;
  try {
    await chain;
    await Promise.all([...inFlight]);
  } catch { /* best effort */ }
}

export const discordAlertsEnabled = () => isEnabled();
