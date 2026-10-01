# deploy/aws

**Everything in this directory is an example and is UNVERIFIED. Nothing here was deployed to AWS, run through nginx, or executed in CloudFront/ECS.** Validate each file in a scratch account/host before relying on it. Prices are rough and must be re-checked in the AWS calculator.

| File | What it is |
|---|---|
| `nginx.realvista.conf.example` | nginx server block for the current single-EC2 setup: TLS, SPA fallback (`try_files $uri $uri/ /index.html`), immutable cache for `/assets` and `/fonts`, no-cache for `index.html`, `sw.js`, `workbox-*`, `registerSW.js`, manifest, sitemap, robots, proxy of `/api`, `/uploads`, `/socket.io` (websocket upgrade) to `127.0.0.1:3000`, static `/app/`, forwarded client IP/proto/host, security headers. Brotli needs a module stock nginx lacks (noted in the file). |
| `cloudfront-function.js` | Viewer-request function for the S3-hosted SPA: prerendered pages (`/privacy`, `/terms`, `/cookies`, `/refunds`, `/download`) -> `<path>/index.html`; other extensionless client routes -> `/index.html`; `/api`, `/socket.io`, `/uploads`, `/app` untouched. Logic was exercised in plain Node only. |
| `ecs-task-definition.example.json` | Fargate task, 0.5 vCPU / 1 GB, secrets by `valueFrom`, container healthcheck on `/api/health/live`, `stopTimeout` 30, `initProcessEnabled`, awslogs. All `<PLACEHOLDER>` values must be replaced. JSON syntax is valid; it was not registered with ECS. |

The repo `Dockerfile` has an API-only target for this layout: `docker build --target api -t estate-api .` (the default target still builds the full image `docker-compose.yml` uses).

## Three stages

1. **Single EC2, hardened (today).** nginx + PM2/Docker + Atlas. Apply the nginx example, container healthcheck/tini, backups below. Cheapest, and correct while there is one instance.
2. **ECS Fargate + ALB + CloudFront + S3 + ElastiCache.** SPA in S3 behind CloudFront (with `cloudfront-function.js`); `/api/*`, `/socket.io/*`, `/uploads/*` behaviors go to the ALB; API on Fargate from the `api` image target; Redis in ElastiCache; uploads in S3; Atlas via PrivateLink.
3. **Autoscaling.** Scale tasks on CPU/ALB request count once 2+ instances are safe (blockers below).

## Blockers before running 2+ API instances

- **Uploads are on local disk** (`uploads/`). Move to S3 (or EFS as a stopgap) first; otherwise a file lands on one task and 404s from the other.
- **Socket.IO has no adapter** (`@socket.io/redis-adapter` is not installed). Add it, backed by the same Redis, or events reach only clients on the same task.
- **Transport:** use websocket-only transport, or enable ALB sticky sessions; polling without either breaks across tasks.
- **Trust proxy hops.** Behind CloudFront + ALB the client IP is the 2nd hop from the right in `X-Forwarded-For`. Set `TRUST_PROXY_HOPS=2` (env-driven in `backend/app.js`; confirm it landed). With the wrong value, rate limits and security logs key on a CloudFront/ALB address or on a spoofable header. Single nginx = 1.
- **Lock the origin.** ALB security group allows only the CloudFront managed prefix list (`com.amazonaws.global.cloudfront.origin_facing`), and CloudFront adds a secret custom header the ALB listener rule requires. Otherwise anyone can hit the ALB directly and forge `X-Forwarded-For`.
- **`REDIS_URL` must be set** so the rate limiter and cache invalidation are shared.
- Scheduled jobs already use Mongo leases and are safe on N instances.

## Environment: secret vs plain

Secrets (Secrets Manager / SSM SecureString, injected via `secrets.valueFrom`): `MONGO_URI`, `JWT_SECRET`, `REFRESH_SECRET`, `MESSAGE_ENCRYPTION_KEY`, `API_RESPONSE_SECRET`, `UNSUBSCRIBE_SECRET` (if set), `REDIS_URL` (contains auth), `SMTP_PASS`, `TWILIO_AUTH_TOKEN`, `OPENOBSERVE_PASSWORD`, `METRICS_TOKEN`.

Plain `environment`: `NODE_ENV`, `PORT`, `HOST`, `FRONTEND_URL`, `APP_DOMAIN`, `DEFAULT_TENANT_SLUG`, `TRUST_PROXY_HOPS`, `NODE_OPTIONS`, `JOBS_ENABLED`, `LOG_LEVEL`, `SMTP_HOST/PORT/USER/FROM`, `BACKUP_*`.

Build-time (baked into the public bundle, set as Docker `--build-arg` or CI vars, not runtime): `VITE_*`. `VITE_API_RESPONSE_SECRET` ships to every browser by design and must equal `API_RESPONSE_SECRET`.

## IAM least-privilege outline (not a ready policy)

- **Execution role** (ECS agent): `AWSECSTaskExecutionRolePolicy`; `secretsmanager:GetSecretValue` on the specific secret ARNs; `ssm:GetParameters` on the specific parameters; `kms:Decrypt` on their key.
- **Task role** (the app): `s3:GetObject/PutObject/DeleteObject` on `arn:aws:s3:::<uploads-bucket>/*` only; nothing else.
- **CI deploy role** (GitHub OIDC, no long-lived keys): `ecr:*` push on one repository, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `iam:PassRole` restricted to the two roles above, `s3:PutObject/DeleteObject` on the SPA bucket, `cloudfront:CreateInvalidation` on one distribution.
- **Backup job role:** `s3:PutObject` on the backup bucket only.

## Alarms to create

ALB `HTTPCode_Target_5XX_Count` and `UnHealthyHostCount`; ALB `TargetResponseTime` p95; ECS service CPU and memory above 80%; running task count below desired; ECS task stopped/OOM events; CloudFront 5xxErrorRate; ElastiCache CPU/evictions/memory; Atlas connections, replication lag, disk; log metric filter on `level":"error"`; **backup freshness** (no new object in the backup bucket for 26 h); budget alarm.

## Database and backups

- **Stay on MongoDB Atlas.** DocumentDB is not recommended: listing search relies on `$text` and `$facet`, which it does not fully support.
- Connect over **AWS PrivateLink** (Atlas private endpoint) rather than the public allow-list once on ECS.
- **Backups:** enable Atlas Cloud Backup (needs M10+; shared tiers have none) with point-in-time restore, **plus** a scheduled `mongodump` (`backend/scripts/backup.js`, or an EventBridge-scheduled Fargate task using the `mongo` image) copied to an S3 bucket **in another region** with versioning and lifecycle expiry. A dump is not a backup until a restore has been rehearsed (`scripts/restore.js`, `--dryRun`).

## Rough cost (estimates, verify before committing)

Stage 1: roughly a t3.small/medium EC2 plus Atlas. Stage 2: Fargate 0.5 vCPU/1 GB x2 tasks, ALB, a small ElastiCache node, NAT gateway (often the surprise line), CloudFront and S3, plus Atlas M10 and up. See `docs/site-src/pages/aws.html` for ranges.
