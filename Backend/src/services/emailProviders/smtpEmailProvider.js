const nodemailer = require('nodemailer');
const env = require('../../config/env');

let transporterPromise = null;

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure,
        auth: {
          user: env.smtpUser,
          pass: env.smtpPass,
        },
      })
    );
  }

  return transporterPromise;
}

async function send(message) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: env.emailFrom,
    replyTo: env.emailReplyTo || undefined,
    ...message,
  });

  return {
    sent: true,
    skipped: false,
    provider: 'smtp',
    messageId: info.messageId || null,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
  };
}

module.exports = {
  send,
};
