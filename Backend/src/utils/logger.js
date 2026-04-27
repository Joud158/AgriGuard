function logInfo(message, meta) {
  console.log(`[INFO] ${message}`, meta || '');
}

function logWarn(message, meta) {
  console.warn(`[WARN] ${message}`, meta || '');
}

function logError(message, meta) {
  console.error(`[ERROR] ${message}`, meta || '');
}

module.exports = {
  logInfo,
  logWarn,
  logError,
};
