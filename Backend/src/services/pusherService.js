const crypto = require('crypto');
const env = require('../config/env');
const httpError = require('../utils/httpError');

let client = null;
let PusherCtor = null;

function isConfigured() {
  return Boolean(env.pusherAppId && env.pusherKey && env.pusherSecret && env.pusherCluster);
}

function getConversationChannelName(conversationId) {
  return `private-conversation-${conversationId}`;
}

function getUserChannelName(userId) {
  return `private-user-${userId}`;
}

function getClient() {
  if (!isConfigured()) {
    return null;
  }

  if (!client) {
    if (!PusherCtor) {
      try {
        PusherCtor = require('pusher');
      } catch (error) {
        throw httpError(503, 'Realtime messaging dependency is not installed.');
      }
    }

    client = new PusherCtor({
      appId: env.pusherAppId,
      key: env.pusherKey,
      secret: env.pusherSecret,
      cluster: env.pusherCluster,
      useTLS: true,
    });
  }

  return client;
}

function authorizeWithoutSdk(socketId, channelName) {
  const stringToSign = `${socketId}:${channelName}`;
  const signature = crypto
    .createHmac('sha256', env.pusherSecret)
    .update(stringToSign)
    .digest('hex');

  return {
    auth: `${env.pusherKey}:${signature}`,
  };
}

async function triggerConversationMessage(conversationId, payload, socketId = '') {
  const pusher = getClient();
  if (!pusher) {
    return false;
  }

  const params = socketId ? { socket_id: socketId } : undefined;
  await pusher.trigger(getConversationChannelName(conversationId), 'message:new', payload, params);
  return true;
}

async function triggerUserConversationRefresh(userId, payload, socketId = '') {
  const pusher = getClient();
  if (!pusher) {
    return false;
  }

  const params = socketId ? { socket_id: socketId } : undefined;
  await pusher.trigger(getUserChannelName(userId), 'conversation:refresh', payload, params);
  return true;
}

function authorizeConversationChannel(socketId, channelName) {
  if (!isConfigured()) {
    throw httpError(503, 'Realtime messaging is not configured.');
  }

  const safeSocketId = String(socketId || '').trim();
  const safeChannelName = String(channelName || '').trim();

  if (!safeSocketId || !safeChannelName) {
    throw httpError(400, 'Socket ID and channel name are required for realtime authorization.');
  }

  return authorizeWithoutSdk(safeSocketId, safeChannelName);
}
function authorizeUserChannel(socketId, channelName) {
  return authorizeConversationChannel(socketId, channelName);
}

module.exports = {
  isConfigured,
  getConversationChannelName,
  getUserChannelName,
  triggerConversationMessage,
  triggerUserConversationRefresh,
  authorizeConversationChannel,
  authorizeUserChannel,
};
