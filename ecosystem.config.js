module.exports = {
  apps: [
    {
      name: "his-connect-erp",
      script: "app/app.js",
      instances: 2,
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};