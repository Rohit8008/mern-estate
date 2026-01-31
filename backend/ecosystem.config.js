module.exports = {
  apps: [
    {
      name: 'mern-estate-api',
      script: 'index.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Process management
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Logging
      log_file: 'logs/pm2-combined.log',
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Monitoring
      watch: false, // Disable in production
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      
      // Memory management
      max_memory_restart: '1G',
      
      // Advanced features
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Health monitoring
      health_check_grace_period: 3000,
      health_check_interval: 30000,
      
      // Environment-specific settings
      node_args: '--max-old-space-size=1024',
      
      // Source map support
      source_map_support: true,
      
      // Auto restart on file changes (development only)
      watch_options: {
        followSymlinks: false,
        usePolling: true,
        interval: 1000,
      },
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/mern-estate.git',
      path: '/var/www/mern-estate',
      'pre-deploy-local': '',
      'post-deploy': 'cd backend && npm install && cd ../frontend && npm install && npm run build && cd ../backend && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
