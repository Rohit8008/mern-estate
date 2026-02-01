# Production Setup Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- MongoDB 5.0+
- Git

### Installation

1. **Clone and Install Dependencies**
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

2. **Environment Configuration**

Create `backend/.env`:
```env
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
MONGO_URI=mongodb://localhost:27017/mern-estate

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this
JWT_ISSUER=mern-estate
JWT_AUDIENCE=mern-estate-users

# Security
BCRYPT_ROUNDS=10
ENABLE_RATE_LIMITING=true

# CORS
CORS_ORIGIN=http://localhost:5173

# Optional: Sentry for error tracking
SENTRY_DSN=your-sentry-dsn
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:3000
```

3. **Start Development Servers**

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

4. **Access the Application**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api

## 📦 Production Build

### Backend
```bash
cd backend
npm start
```

### Frontend
```bash
cd frontend
npm run build
# Built files will be in frontend/dist
```

## 🔑 Initial Admin Setup

Since signup is disabled, you need to create an admin user directly in MongoDB:

```javascript
// Connect to MongoDB
use mern-estate

// Create admin user
db.users.insertOne({
  username: "admin",
  email: "admin@example.com",
  password: "$2a$10$YourHashedPasswordHere", // Use bcrypt to hash
  role: "admin",
  status: "active",
  firstName: "Admin",
  lastName: "User",
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Or use the existing signup endpoint temporarily in development.

## 🎯 Using New Features

### 1. Advanced Property Filtering

**API Example:**
```javascript
// Filter properties by city, status, and assigned agent
fetch('/api/listing/get?city=Mumbai&status=available&assignedAgent=unassigned&limit=20')
```

**Query Parameters:**
- `city` - Filter by city
- `locality` - Filter by locality
- `status` - available | sold | under_negotiation
- `assignedAgent` - Agent ID or 'unassigned'
- `propertyCategory` - residential | commercial | land
- `propertyType` - apartment | villa | house
- `minAreaSqFt` / `maxAreaSqFt` - Area range
- `minPrice` / `maxPrice` - Price range
- `searchTerm` - Search in name, description, address, city, locality

### 2. Agent Assignment (Admin Only)

```javascript
// Assign property to agent
fetch('/api/listing/assign-agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    listingId: '507f1f77bcf86cd799439011',
    agentId: '507f1f77bcf86cd799439012'
  })
})

// Get my assigned properties (Employee)
fetch('/api/listing/my-assigned?status=available')
```

### 3. Dashboard Analytics

```javascript
// Get dashboard data
fetch('/api/dashboard/analytics')
  .then(res => res.json())
  .then(data => {
    console.log('Total Properties:', data.data.properties.total);
    console.log('Available:', data.data.properties.available);
    console.log('Sold:', data.data.properties.sold);
  });
```

### 4. Buyer Requirements with Follow-ups

```javascript
// Create buyer requirement with follow-up
fetch('/api/buyer-requirements', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    buyerName: 'John Doe',
    buyerPhone: '+919876543210',
    buyerEmail: 'john@example.com',
    preferredCity: 'Mumbai',
    preferredLocality: 'Andheri',
    propertyTypeInterest: 'residential',
    minPrice: 5000000,
    maxPrice: 10000000,
    followUpDate: '2026-02-15',
    priority: 'high',
    status: 'active'
  })
})
```

## 🗄️ Database Indexes

The application automatically creates indexes on startup. To verify:

```javascript
// Check listing indexes
db.listings.getIndexes()

// Check buyer requirement indexes
db.buyerrequirements.getIndexes()
```

## 🔒 Security Best Practices

1. **Change Default Secrets**
   - Update JWT_SECRET and JWT_REFRESH_SECRET
   - Use strong, random values (32+ characters)

2. **Enable HTTPS in Production**
   - Use reverse proxy (nginx/Apache)
   - Configure SSL certificates

3. **Rate Limiting**
   - Already enabled by default
   - Adjust limits in `backend/middleware/security.js`

4. **CORS Configuration**
   - Update CORS_ORIGIN in production
   - Use specific domains, not wildcards

5. **MongoDB Security**
   - Enable authentication
   - Use strong passwords
   - Restrict network access

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Logs
Backend uses Winston logger. Logs are output to console and can be configured for file/external services.

### Error Tracking
Sentry integration is ready. Add SENTRY_DSN to enable.

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9
```

### MongoDB Connection Failed
- Check MongoDB is running: `mongosh`
- Verify MONGO_URI in .env
- Check network connectivity

### Frontend Can't Connect to Backend
- Verify backend is running on port 3000
- Check CORS settings
- Verify proxy configuration in `frontend/vite.config.js`

### Missing Dependencies
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

## 📱 Mobile Testing

The UI is responsive. Test on:
- Chrome DevTools mobile emulation
- Real devices via network IP
- BrowserStack/Sauce Labs

## 🚢 Deployment

### Backend (Node.js)
- **Platforms**: Heroku, Railway, Render, DigitalOcean, AWS
- **Process Manager**: PM2 recommended
- **Environment**: Set all .env variables

### Frontend (Static)
- **Platforms**: Vercel, Netlify, Cloudflare Pages
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### Database
- **MongoDB Atlas** (recommended for production)
- **Self-hosted** with proper backups

## 📈 Performance Tips

1. **Enable Compression** - Already configured
2. **Use CDN** - For static assets
3. **Database Indexes** - Already optimized
4. **Caching** - Consider Redis for sessions
5. **Image Optimization** - Use Cloudinary/ImageKit

## 🔄 Backup Strategy

```bash
# Backup MongoDB
mongodump --uri="mongodb://localhost:27017/mern-estate" --out=/backup/$(date +%Y%m%d)

# Restore MongoDB
mongorestore --uri="mongodb://localhost:27017/mern-estate" /backup/20260131
```

## 📞 Support

For issues or questions:
1. Check PRODUCTION_FEATURES.md for feature documentation
2. Review error logs in backend console
3. Check browser console for frontend errors
4. Verify API responses with Postman/curl

---

**Ready for Production!** 🎉

The platform now includes:
- ✅ Advanced filtering and search
- ✅ Agent assignment system
- ✅ Dashboard analytics
- ✅ Soft delete functionality
- ✅ Role-based access control
- ✅ Modern UI foundation
- ✅ Performance optimizations
- ✅ Security hardening
