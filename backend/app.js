import { logger } from './utils/logger.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import hpp from 'hpp';
import { errorEnvelope } from './middleware/errorEnvelope.js';

import observabilityRouter from './routes/observability.route.js';

import userRouter from './routes/user.route.js';
import authRouter from './routes/auth.route.js';
import listingRouter from './routes/listing.route.js';
import categoryRouter from './routes/category.route.js';
import uploadRouter from './routes/upload.route.js';
import messageRouter from './routes/message.route.js';
import ownerRouter from './routes/owner.route.js';
import buyerRequirementRouter from './routes/buyerRequirement.route.js';
import roleRouter from './routes/role.route.js';
import healthRouter from './routes/health.route.js';
import docsRouter from './routes/docs.route.js';
import clientRouter from './routes/client.route.js';
import documentRouter from './routes/document.route.js';
import taskRouter from './routes/task.route.js';
import calendarEventRouter from './routes/calendarEvent.route.js';
import metricsRouter from './routes/metrics.route.js';
import crmRouter from './routes/crm.route.js';
import analyticsRouter from './routes/analytics.route.js';
import dashboardRouter from './routes/dashboard.route.js';
import propertyTypeRouter from './routes/propertyType.route.js';
import activityRouter from './routes/activity.route.js';
import notificationRouter from './routes/notification.route.js';
import tagRouter from './routes/tag.route.js';
import leadSourceRouter from './routes/leadSource.route.js';
import dataRightsRouter from './routes/dataRights.route.js';
import webhookRouter from './routes/webhook.route.js';
import emailTemplateRouter from './routes/emailTemplate.route.js';
import rulesRouter from './routes/rules.route.js';
import sequenceRouter from './routes/sequence.route.js';
import leadImportRouter from './routes/leadImport.route.js';
import geocodeRouter from './routes/geocode.route.js';
import reportTemplateRouter from './routes/reportTemplate.route.js';
import generatedReportRouter from './routes/generatedReport.route.js';
import searchRouter from './routes/search.route.js';
import contactRouter from './routes/contact.route.js';
import unsubscribeRouter from './routes/unsubscribe.route.js';
import transactionRouter from './routes/transaction.route.js';

import {
  securityHeaders,
  mongoSanitization,
  xssProtection,
  apiRateLimit,
  strictRateLimit,
  requestLogger,
} from './middleware/security.js';

import { config } from './config/environment.js';
import { globalErrorHandler } from './utils/error.js';
import { requestContext } from './utils/logContext.js';
import { encryptResponse } from './middleware/encryptResponse.js';
import { resolveTenant } from './tenancy/resolveTenant.js';
import { readOnlyWhileActing } from './tenancy/readOnlyWhileActing.js';
import { requireCsrfToken } from './middleware/csrf.js';
import tenantRouter from './routes/tenant.route.js';
import platformRouter from './routes/platform.route.js';
import shareRouter from './routes/share.route.js';

const __dirname = path.resolve();

const DEFAULT_BODY_LIMIT = '1mb';
const LARGE_BODY_LIMIT = '10mb';
/** Bulk-import and upload endpoints: the only ones that may carry a large body. */
export const LARGE_BODY_PATHS =
  /^\/api\/(listing\/(import\/|bulk-import$)|lead-import\/|upload\/|clients\/bulk$|buyer-requirements\/bulk$)/;

const ONE_YEAR_S = 60 * 60 * 24 * 365;

/**
 * Cache policy for the built frontend. Vite content-hashes everything under
 * /assets, so those files can never change under the same URL and may be cached
 * forever; the HTML shell and the service worker must be revalidated every time
 * or a deploy would not reach returning visitors.
 */
/** One neutral, branded page for every server-rendered 404. */
function notFoundPage({ title, text, detail = '' }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" /><title>${escapeHtml(title)} — Real Vista</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f5f4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;max-width:480px;width:92%;padding:36px 32px;text-align:center}
h1{font-size:22px;margin:0 0 8px}p{color:#334155;line-height:1.6;margin:0 0 20px}
code{display:inline-block;background:#f1f5f9;border-radius:8px;padding:6px 10px;font-size:13px;color:#475569;margin-bottom:20px;word-break:break-all}
a{display:inline-block;background:#2b6faa;color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px}
</style></head><body><main class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p>${detail ? `<code>${escapeHtml(detail)}</code><br>` : ''}<a href="/">Go to Real Vista</a></main></body></html>`;
}

export function setDistHeaders(res, filePath) {
  const rel = filePath.split(path.sep).join('/');
  if (/\/assets\//.test(rel)) {
    res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR_S}, immutable`);
  } else if (/(index\.html|sw\.js|service-worker\.js|manifest\.webmanifest)$/.test(rel)) {
    res.setHeader('Cache-Control', 'no-cache');
  }
}

// SEC-003: Escape characters that have special meaning in HTML so that
// req.originalUrl cannot inject executable content into the 404 response.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function createApp() {
  const app = express();

  // How many reverse proxies sit in front of this process (load balancer, nginx,
  // CDN...). req.ip, and therefore every rate-limit bucket, is only correct when
  // this matches reality: too low and everyone shares the proxy's IP, too high
  // and a client can spoof X-Forwarded-For. 0 turns it off.
  if (config.server.isProduction || process.env.TRUST_PROXY_HOPS !== undefined) {
    const hops = config.server.trustProxyHops;
    app.set('trust proxy', hops > 0 ? hops : false);
  }

  // First, so every log line from here on — access, errors, audit — carries
  // the same request id, echoed back to the client as X-Request-Id.
  app.use(requestContext);
  app.use(securityHeaders);
  app.use(requestLogger);

  // Compress responses (safe to apply globally; keeps SSE/ws unaffected)
  app.use(compression());

  app.use(cors(config.cors));
  // Development only: in production the structured access line from
  // requestLogger is the request log, and a second unstructured copy just
  // doubled stdout volume.
  if (!config.server.isProduction && process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  // The access cookie is read by the limiter to key a bucket by user, so the
  // (cheap) cookie parser has to run first.
  app.use(cookieParser());

  // Rate limiting runs BEFORE the body is read, so a flood is refused without
  // paying to buffer, parse and sanitise a payload for every rejected request.
  // CORS is already applied, so the browser can read the 429.
  if (config.security.enableRateLimiting) {
    app.use('/api/upload', strictRateLimit);
    app.use('/api/', apiRateLimit);
  }

  // Parse BEFORE sanitising. The sanitisers used to run first, when req.body
  // was still undefined — so `{"email": {"$ne": null}}` reached the
  // controllers untouched and only query strings were ever cleaned.
  //
  // 1 MB everywhere except the routes that legitimately carry a spreadsheet's
  // worth of rows; the other 10 MB was an open invitation to buffer large
  // junk on every endpoint.
  const smallJson = express.json({ limit: DEFAULT_BODY_LIMIT });
  const smallForm = express.urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT });
  const bigJson = express.json({ limit: LARGE_BODY_LIMIT });
  const bigForm = express.urlencoded({ extended: true, limit: LARGE_BODY_LIMIT });
  app.use((req, res, next) => (LARGE_BODY_PATHS.test(req.path) ? bigJson : smallJson)(req, res, next));
  app.use((req, res, next) => (LARGE_BODY_PATHS.test(req.path) ? bigForm : smallForm)(req, res, next));

  // Protect against HTTP Parameter Pollution (e.g. ?role=user&role=admin)
  app.use(hpp());
  app.use(mongoSanitization);
  app.use(xssProtection);

  app.use('/api', encryptResponse);
  // After encryptResponse on purpose: each wraps res.json and the last one
  // installed runs first, so the code and request id are added to the body
  // before it is encrypted rather than to the ciphertext envelope.
  app.use(errorEnvelope);

  // Health checks answer before tenant resolution: a load balancer probe has no
  // workspace, and a broken tenant lookup must not take the pod out of service.
  app.use('/api/health', healthRouter);

  // Unsubscribe also answers before tenant resolution. The signed token names
  // the workspace, and the link must work however the request arrives: from a
  // mail client's one-click POST to an old domain, or for an agency that has
  // since been suspended or closed — a person's "stop" is honoured regardless.
  // The controller enters the token's workspace itself.
  app.use('/api/unsubscribe', unsubscribeRouter);

  // Everything past this line runs inside a tenant context, so every query is
  // scoped without any handler having to remember to scope it.
  app.use('/api', resolveTenant());
  // A platform operator viewing a customer's workspace can read it, not change
  // it. Enforced once at the edge so a controller added later inherits it.
  app.use('/api', readOnlyWhileActing);

  // Cookie-only auth plus sameSite:'none' in production means a cross-site
  // form POST would otherwise carry the session. Exemptions come from
  // security/publicRoutes.js, so they cannot drift from the route allowlist.
  app.use('/api', requireCsrfToken);

  app.use('/api/tenant', tenantRouter);
  // Sharing chosen properties outside the agency — what replaced public browsing.
  app.use('/api/share', shareRouter);
  // The vendor's own console. Guarded by the platform flag inside the router.
  app.use('/api/platform', platformRouter);
  app.use('/api/user', userRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/listing', listingRouter);
  app.use('/api/category', categoryRouter);
  app.use('/api/property-types', propertyTypeRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/message', messageRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/buyer-requirements', buyerRequirementRouter);
  app.use('/api/roles', roleRouter);
  app.use('/api/clients', clientRouter);
  app.use('/api/documents', documentRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/calendar-events', calendarEventRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/crm', crmRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/tags', tagRouter);
  app.use('/api/docs', docsRouter);
  app.use('/api/lead-sources', leadSourceRouter);
  app.use('/api/data-rights', dataRightsRouter);
  app.use('/api/webhooks', webhookRouter);
  app.use('/api/email-templates', emailTemplateRouter);
  app.use('/api/rules', rulesRouter);
  app.use('/api/sequences', sequenceRouter);
  app.use('/api/lead-import', leadImportRouter);
  app.use('/api/geocode', geocodeRouter);
  app.use('/api/report-templates', reportTemplateRouter);
  app.use('/api/generated-reports', generatedReportRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/contact', contactRouter);
  app.use('/api/observability', observabilityRouter);
  app.use('/api/transactions', transactionRouter);

  app.use(express.static(path.join(__dirname, '/frontend/dist'), { setHeaders: setDistHeaders }));
  // Documents are NOT public. This directory holds client contracts, RERA
  // certificates and layout plans, and the static mount below sits outside
  // `/api`, so nothing resolved a tenant or checked a session on the way past.
  // Old rows still carry absolute `/uploads/docs/...` URLs, so redirect rather
  // than 404 — the request then goes through verifyToken and the ownership
  // check like any other. Always terminates: never falls through to static.
  app.use('/uploads/docs', (req, res) => {
    const name = req.path.replace(/^\/+/, '');
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      return res.status(400).json({ success: false, message: 'Not a valid document reference.' });
    }
    return res.redirect(307, `/api/documents/file/${name}`);
  });

  // Listing photographs and avatars only. These are referenced by <img> from
  // share pages, which have no session by design.
  // Filenames are unique per upload, so an hour of caching is safe and spares the
  // server every repeat image fetch.
  app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '1h' }));

  app.use('/api', (req, res) => {
    const acceptsHtml = String(req.headers['accept'] || '').includes('text/html');
    if (acceptsHtml) {
      return res.status(404).send(notFoundPage({
        title: "We couldn't find that",
        text: 'The link you followed does not point to anything on Real Vista.',
        detail: `${req.method} ${req.originalUrl}`,
      }));
    }
    res.status(404).json({ success: false, statusCode: 404, code: 'NOT_FOUND', message: 'API route not found', requestId: req.id });
  });

  app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexPath);
    }
    // Production without a client build is a deploy fault, not something to
    // explain to a visitor: say so in the log, show a neutral page.
    logger.error('Client build missing; serving fallback 404', { path: req.originalUrl });
    res.status(404).send(notFoundPage({
      title: "This page isn't available",
      text: "Something went wrong on our side. Please try again in a few minutes.",
    }));
  });

  app.use(globalErrorHandler);

  return app;
}
