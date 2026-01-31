# MERN Estate - Deployment Guide

This guide covers deploying the MERN Estate application to Render (recommended for PaaS deployment).

## Prerequisites

- Node.js 18+ installed locally
- MongoDB Atlas account (or self-hosted MongoDB)
- Firebase project for image storage
- (Optional) Sentry account for error tracking
- (Optional) SMTP service for emails (SendGrid, Gmail, etc.)
- (Optional) Twilio account for SMS notifications

## Quick Start with Render

### 1. Prepare Your Repository

Ensure your code is pushed to a Git repository (GitHub, GitLab, or Bitbucket).

### 2. Create MongoDB Atlas Database

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a new cluster (free tier available)
3. Create a database user
4. Whitelist all IP addresses (0.0.0.0/0) for Render access
5. Get your connection string (replace `<password>` with your database user password)

### 3. Deploy to Render

#### Option A: Using Render Blueprint (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New" → "Blueprint"
3. Connect your repository
4. Render will detect `render.yaml` and create services automatically
5. Set the required environment variables in the Render dashboard

#### Option B: Manual Setup

**Create Web Service (API):**
1. Click "New" → "Web Service"
2. Connect your repository
3. Configure:
   - **Name:** mern-estate-api
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node backend/index.js`
   - **Health Check Path:** `/api/health/startup`

**Create Static Site (Frontend):**
1. Click "New" → "Static Site"
2. Connect your repository
3. Configure:
   - **Name:** mern-estate-client
   - **Build Command:** `cd frontend && npm install && npm run build`
   - **Publish Directory:** `./frontend/dist`

## Environment Variables

### Required (API)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `10000` |
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` |
| `JWT_SECRET` | JWT signing secret (64+ chars) | Generate with `openssl rand -base64 64` |
| `REFRESH_SECRET` | Refresh token secret (64+ chars) | Generate with `openssl rand -base64 64` |
| `FRONTEND_URL` | Frontend URL for CORS | `https://mern-estate-client.onrender.com` |

### Optional (API)

| Variable | Description | Default |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry error tracking DSN | - |
| `SMTP_HOST` | SMTP server hostname | - |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | - |
| `SMTP_PASS` | SMTP password | - |
| `EMAIL_FROM` | From email address | `noreply@your-domain.com` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | - |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | - |
| `TWILIO_FROM_NUMBER` | Twilio phone number | - |
| `MESSAGE_ENCRYPTION_KEY` | 32-byte encryption key | Generate with `openssl rand -hex 32` |

### Required (Frontend)

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

### Optional (Frontend)

| Variable | Description |
|----------|-------------|
| `VITE_SENTRY_DSN` | Sentry DSN for frontend error tracking |
| `VITE_SOCKET_URL` | WebSocket URL (leave empty for same-origin) |

## Generate Secure Secrets

```bash
# Generate JWT secrets (run twice, use different values for JWT_SECRET and REFRESH_SECRET)
openssl rand -base64 64

# Generate encryption key
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

## Post-Deployment Checklist

### 1. Verify Deployment

```bash
# Check API health
curl https://your-api-url.onrender.com/api/health/health

# Check frontend
curl https://your-frontend-url.onrender.com
```

### 2. Create Admin User

After deployment, create your first admin user:

```bash
# SSH into your server or use Render shell
npm run make-admin
```

### 3. Configure Firebase Storage Rules

Ensure your Firebase Storage rules allow authenticated uploads:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### 4. Set Up Custom Domain (Optional)

1. Go to your Render service settings
2. Add your custom domain
3. Configure DNS with your domain registrar
4. Render will automatically provision SSL certificate

## Database Backups

### MongoDB Atlas (Recommended)

MongoDB Atlas provides automatic backups. To configure:
1. Go to your cluster
2. Click "Backup"
3. Enable continuous backup or scheduled snapshots

### Manual Backups

For additional local backups:

```bash
# Set MONGO_URI environment variable
export MONGO_URI="your-connection-string"

# Run backup
npm run db:backup
```

Backups are stored in the `./backups` directory with automatic rotation (keeps last 7).

### Restore from Backup

```bash
mongorestore --uri="your-connection-string" --gzip ./backups/backup-YYYY-MM-DD
```

## Monitoring

### Health Check Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/health/health` | Full health check |
| `/api/health/startup` | Startup probe |
| `/api/health/ready` | Readiness probe |
| `/api/health/live` | Liveness probe |
| `/api/health/detailed` | Detailed health with all checks |

### Sentry Error Tracking

1. Create a Sentry project at [sentry.io](https://sentry.io)
2. Get your DSN
3. Set `SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (frontend)
4. Errors will be automatically tracked

### Render Logs

View logs in Render dashboard:
1. Go to your service
2. Click "Logs" tab
3. Filter by time or search for specific errors

## Troubleshooting

### Common Issues

**1. Database Connection Fails**
- Verify MONGO_URI is correct
- Check MongoDB Atlas IP whitelist (add 0.0.0.0/0)
- Ensure database user has correct permissions

**2. CORS Errors**
- Verify FRONTEND_URL is set correctly
- Include https:// in the URL
- Check that the frontend domain matches exactly

**3. File Uploads Fail**
- Check Firebase configuration
- Verify storage rules allow uploads
- Check file size limits

**4. WebSocket Connection Issues**
- Leave VITE_SOCKET_URL empty for same-origin
- Ensure API service is running
- Check for proxy configuration issues

### Performance Optimization

1. **Enable Render Auto-scaling** (paid plans)
2. **Use MongoDB Atlas M10+** for production workloads
3. **Enable Redis caching** for high-traffic scenarios
4. **Configure CDN** for static assets

## Security Checklist

- [ ] All secrets are stored as environment variables
- [ ] JWT secrets are at least 64 characters
- [ ] MongoDB user has minimal required permissions
- [ ] Firebase security rules are configured
- [ ] CORS is configured for your domain only
- [ ] Rate limiting is enabled
- [ ] HTTPS is enforced

## Support

For issues, please create a GitHub issue with:
- Error messages (from logs)
- Steps to reproduce
- Environment details (Node version, deployment platform)
