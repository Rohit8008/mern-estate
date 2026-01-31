# MERN Estate Backend API

A production-ready real estate management system built with Node.js, Express, and MongoDB.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Real Estate Listings**: CRUD operations for property listings
- **User Management**: User profiles with different roles (user, employee, admin)
- **Category Management**: Dynamic category system with custom fields
- **File Upload**: Secure image and document upload
- **Messaging System**: Real-time messaging with Socket.IO
- **Search & Filtering**: Advanced search with multiple filters
- **Security**: Rate limiting, input validation, XSS protection
- **Monitoring**: Health checks, logging, and metrics

## Architecture

```
backend/
├── config/           # Configuration files
│   ├── database.js   # Database connection
│   └── environment.js # Environment configuration
├── controllers/      # Route controllers
├── middleware/       # Custom middleware
├── models/          # Mongoose models
├── routes/          # API routes
├── utils/           # Utility functions
└── index.js         # Main server file
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (v5 or higher)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd mern-estate
```

2. Install dependencies
```bash
npm install
```

3. Create environment file
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development server
```bash
npm run dev
```

## Environment Variables

See `PRODUCTION_DEPLOYMENT.md` for complete environment variable documentation.

### Required Variables
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: JWT signing secret
- `REFRESH_SECRET`: Refresh token secret
- `NODE_ENV`: Environment (development/production)

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/signout` - User logout

### Users
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `DELETE /api/user/profile` - Delete user account

### Listings
- `GET /api/listing` - Get all listings (with filters)
- `POST /api/listing` - Create new listing
- `GET /api/listing/:id` - Get single listing
- `PUT /api/listing/:id` - Update listing
- `DELETE /api/listing/:id` - Delete listing

### Categories
- `GET /api/category` - Get all categories
- `POST /api/category` - Create category (admin only)
- `PUT /api/category/:id` - Update category (admin only)
- `DELETE /api/category/:id` - Delete category (admin only)

### Health Checks
- `GET /api/health/health` - Application health status
- `GET /api/health/ready` - Readiness check
- `GET /api/health/live` - Liveness check
- `GET /api/health/metrics` - Application metrics

## Security Features

### Authentication
- JWT-based authentication
- Refresh token rotation
- Password hashing with bcrypt
- Account lockout after failed attempts

### Authorization
- Role-based access control (RBAC)
- Resource ownership verification
- API key authentication for external services

### Input Validation
- Joi schema validation
- XSS protection
- MongoDB injection prevention
- File upload validation

### Rate Limiting
- Different limits for different endpoints
- IP-based and user-based limiting
- Configurable windows and limits

### Security Headers
- Helmet.js for security headers
- CORS configuration
- Content Security Policy
- HSTS headers

## Database Optimization

### Indexes
- Text search indexes
- Compound indexes for common queries
- Geospatial indexes for location-based searches
- Performance monitoring

### Query Optimization
- Lean queries for better performance
- Pagination for large datasets
- Query result caching
- Database connection pooling

## Logging & Monitoring

### Logging Levels
- ERROR: System errors and exceptions
- WARN: Warning messages
- INFO: General information
- DEBUG: Detailed debugging information

### Log Files
- `logs/error.log` - Error logs
- `logs/warn.log` - Warning logs
- `logs/info.log` - Information logs
- `logs/security.log` - Security events
- `logs/audit.log` - Audit trail

### Monitoring
- Health check endpoints
- Performance metrics
- Database connection status
- Memory and CPU usage

## Error Handling

### Error Types
- `ValidationError` - Input validation errors
- `AuthenticationError` - Authentication failures
- `AuthorizationError` - Permission denied
- `NotFoundError` - Resource not found
- `ConflictError` - Resource conflicts
- `RateLimitError` - Rate limit exceeded

### Error Response Format
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error message",
  "type": "validation",
  "field": "email",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/auth/signup"
}
```

## Performance Optimization

### Database
- Connection pooling
- Query optimization
- Index optimization
- Caching strategies

### API
- Response compression
- Pagination
- Field selection
- Lean queries

### Caching
- Redis integration (optional)
- In-memory caching
- Query result caching

## Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Docker
```bash
docker build -t mern-estate-api .
docker run -p 3000:3000 mern-estate-api
```

## Monitoring & Maintenance

### Health Checks
- Application health: `/api/health/health`
- Readiness: `/api/health/ready`
- Liveness: `/api/health/live`
- Metrics: `/api/health/metrics`

### Log Management
- Log rotation
- Log retention policies
- Centralized logging (optional)

### Performance Monitoring
- Response time monitoring
- Database query performance
- Memory usage tracking
- Error rate monitoring

## Security Best Practices

### Environment Security
- Use strong, unique secrets
- Enable HTTPS in production
- Secure cookie configuration
- Proper CORS setup

### Database Security
- Use authentication
- Enable SSL/TLS
- Regular backups
- Access control

### Application Security
- Input validation
- Output encoding
- Error handling
- Security headers

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Check MongoDB connection string
   - Verify network connectivity
   - Check authentication credentials

2. **Authentication Issues**
   - Verify JWT secrets
   - Check token expiration
   - Validate user status

3. **Performance Issues**
   - Check database indexes
   - Monitor query performance
   - Review memory usage

### Debug Mode
```bash
LOG_LEVEL=debug npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the logs
- Monitor the health endpoints
