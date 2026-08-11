// ecosystem.config.js — PM2 process manager config for EC2 / servers
module.exports = {
  apps: [
    {
      name: 'zhajirii-backend',
      script: 'server.js',
      instances: 2,           // Use 2 CPU cores; set to 'max' for all cores
      exec_mode: 'cluster',   // Cluster mode for load balancing
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
