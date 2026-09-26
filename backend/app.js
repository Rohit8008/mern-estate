import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import hpp from 'hpp';

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
import { encryptResponse } from './middleware/encryptResponse.js';
import { resolveTenant } from './tenancy/resolveTenant.js';
import { readOnlyWhileActing } from './tenancy/readOnlyWhileActing.js';
import { requireCsrfToken } from './middleware/csrf.js';
import tenantRouter from './routes/tenant.route.js';
import platformRouter from './routes/platform.route.js';
import shareRouter from './routes/share.route.js';

const __dirname = path.resolve();

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

  if (config.server.isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(securityHeaders);
  // Protect against HTTP Parameter Pollution (e.g. ?role=user&role=admin)
  app.use(hpp());
  app.use(mongoSanitization);
  app.use(xssProtection);
  app.use(requestLogger);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Compress responses (safe to apply globally; keeps SSE/ws unaffected)
  app.use(compression());

  app.use(cors(config.cors));
  app.use(morgan(config.server.isProduction ? 'combined' : 'dev'));

  if (config.security.enableRateLimiting) {
    app.use('/api/upload', strictRateLimit);
    app.use('/api/', apiRateLimit);
  }

  app.use('/api', encryptResponse);

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

  app.use(express.static(path.join(__dirname, '/frontend/dist')));
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
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use('/api', (req, res) => {
    const acceptsHtml = String(req.headers['accept'] || '').includes('text/html');
    if (acceptsHtml) {
      return res.status(404).send(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>API route not found</title>
        <style>
          body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","Apple Color Emoji","Segoe UI Emoji";background:linear-gradient(135deg,#faf5ff,#f0fdf4,#eff6ff);min-height:100vh;display:flex;align-items:center;justify-content:center}
          .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,.06);max-width:760px;width:92%;overflow:hidden}
          .inner{padding:32px;text-align:center}
          .pill{width:64px;height:64px;border-radius:9999px;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
          .title{font-size:28px;font-weight:800;color:#0f172a;margin:0 0 8px}
          .text{color:#334155;margin:0 0 20px}
          .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;display:inline-block}
          .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:14px}
          .btn{padding:10px 16px;border-radius:10px;border:1px solid #e5e7eb;color:#0f172a;text-decoration:none}
          .btn.primary{background:#0f172a;color:#fff;border-color:#0f172a}
          .btn:hover{opacity:.95}
        </style>
      </head>
      <body>
        <div class="card">
          <div class="inner">
            <div class="pill" aria-hidden="true">🛣️</div>
            <h1 class="title">API route not found</h1>
            <p class="text">The endpoint you requested does not exist:</p>
            <div class="mono">${escapeHtml(req.method)} ${escapeHtml(req.originalUrl)}</div>
            <div class="row">
              <a href="/" class="btn primary">Go Home</a>
              <a href="/messages" class="btn">Open Messages</a>
            </div>
          </div>
        </div>
      </body>
    </html>`);
    }
    res.status(404).json({ success: false, statusCode: 404, message: 'API route not found' });
  });

  app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    res.status(404).send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Page not found</title>
      <style>
        body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","Apple Color Emoji","Segoe UI Emoji";background:linear-gradient(135deg,#eef2ff,#fef3c7,#ecfeff);min-height:100vh;display:flex;align-items:center;justify-content:center}
        .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,.06);max-width:680px;width:92%;overflow:hidden}
        .inner{padding:32px;text-align:center}
        .pill{width:64px;height:64px;border-radius:9999px;background:#e0f2fe;color:#0369a1;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
        .title{font-size:28px;font-weight:800;color:#0f172a;margin:0 0 8px}
        .text{color:#334155;margin:0 0 20px}
        .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
        .btn{padding:10px 16px;border-radius:10px;border:1px solid #e5e7eb;color:#0f172a;text-decoration:none}
        .btn.primary{background:#0f172a;color:#fff;border-color:#0f172a}
        .btn:hover{opacity:.95}
        code{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:2px 6px}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="inner">
          <div class="pill" aria-hidden="true">🔎</div>
          <h1 class="title">This page isn’t available</h1>
          <p class="text">You’re in development without a client build. Use the SPA routes via the dev server at <code>http://localhost:5173</code>, or build the client to enable server-side fallback.</p>
          <div class="row">
            <a href="http://localhost:5173" class="btn primary">Go Home</a>
            <a href="/search" class="btn">Search</a>
          </div>
        </div>
      </div>
    </body>
  </html>`);
  });

  app.use(globalErrorHandler);

  return app;
}
