const { logInfo } = require('../../utils/logger');

async function send(message, logContext) {
  logInfo('Stub email provider captured email', {
    ...logContext,
    to: message.to,
    subject: message.subject,
  });

  return {
    sent: false,
    skipped: true,
    provider: 'stub',
    reason: 'Stub email provider is active.',
  };
}

module.exports = {
  send,
};
