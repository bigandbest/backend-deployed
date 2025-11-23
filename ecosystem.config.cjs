/**
 * PM2 Ecosystem Configuration for AWS Deployment
 * 
 * This file configures PM2 to manage the Node.js application with clustering.
 * PM2 will handle process management, auto-restart, and load balancing.
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 start ecosystem.config.cjs --env development
 */

module.exports = {
  apps: [
    {
      // Application name
      name: "bigandbest-api",
      
      // Entry point
      script: "./server.js",
      
      // Execution mode: cluster or fork
      // 'cluster' mode enables load balancing across CPU cores
      exec_mode: "cluster",
      
      // Number of instances (0 = auto-detect CPU cores)
      // You can also set a specific number like 4
      instances: "max", // Uses all available CPU cores
      
      // Auto-restart on file changes (useful for development)
      watch: false,
      
      // Maximum memory before auto-restart (prevents memory leaks)
      max_memory_restart: "1G",
      
      // Environment variables for production
      env_production: {
        NODE_ENV: "production",
        PORT: 8000,
        CLUSTER_MODE: "false", // PM2 handles clustering, so disable app-level clustering
      },
      
      // Environment variables for development
      env_development: {
        NODE_ENV: "development",
        PORT: 8000,
        CLUSTER_MODE: "false", // PM2 handles clustering
      },
      
      // Logging
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      
      // Merge logs from all instances
      merge_logs: true,
      
      // Auto-restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Source map support for better error traces
      source_map_support: true,
      
      // Instance variables (useful for debugging)
      instance_var: "INSTANCE_ID",
    },
  ],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: "ubuntu", // SSH user
      host: ["your-ec2-instance.amazonaws.com"], // Your EC2 instance
      ref: "origin/main",
      repo: "git@github.com:yourusername/yourrepo.git",
      path: "/var/www/bigandbest",
      "post-deploy": "npm install && pm2 reload ecosystem.config.cjs --env production",
      env: {
        NODE_ENV: "production",
      },
    },
  },
};
