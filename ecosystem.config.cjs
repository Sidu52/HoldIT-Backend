module.exports = {
  apps: [
    {
      name: "holdit-backend",
      script: "app.js",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
