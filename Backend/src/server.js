const app = require('./app');
const env = require('./config/env');
const { ensureDbExists } = require('./data/store');
const { logInfo } = require('./utils/logger');

async function start() {
  await ensureDbExists();
  app.listen(env.port, () => {
    logInfo(`AgriGuard auth backend listening on http://localhost:${env.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
