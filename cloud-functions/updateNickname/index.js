const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

function parseEventPayload(event) {
  if (!event) return {};
  if (typeof event === 'string') {
    try { return JSON.parse(event); } catch { return {}; }
  }
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
    return event.queryStringParameters;
  }
  if (event.queryString && typeof event.queryString === 'object') {
    return event.queryString;
  }
  if (event.body) {
    let body = event.body;
    if (event.isBase64Encoded && typeof body === 'string') {
      try { body = Buffer.from(body, 'base64').toString('utf8'); } catch {}
    }
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch {}
      try { return Object.fromEntries(new URLSearchParams(body)); } catch {}
      return {};
    }
    if (typeof body === 'object') return body;
  }
  return event;
}

/**
 * 更新用户昵称
 *
 * 请求：{ userId, nickname }
 */
exports.main = async (event, context) => {
  let { userId, nickname } = parseEventPayload(event);

  if (!userId || !nickname) {
    return { code: 400, message: '参数不完整' };
  }
  if (typeof nickname !== 'string' || nickname.length > 50 || nickname.length === 0) {
    return { code: 400, message: '昵称长度需要在1-50个字符之间' };
  }
  // 简单的昵称安全过滤
  if (/[<>"'&]/.test(nickname)) {
    return { code: 400, message: '昵称包含非法字符' };
  }

  try {
    // 验证用户存在
    const userResult = await db.collection('users').doc(userId).get();
    if (!userResult.data) {
      return { code: 404, message: '用户不存在' };
    }

    await db.collection('users').doc(userId).update({
      nickname,
      updatedAt: new Date()
    });

    console.log('[updateNickname] 用户昵称已更新:', userId, '->', nickname);

    return {
      code: 0,
      message: '昵称更新成功',
      data: { nickname }
    };

  } catch (err) {
    console.error('[updateNickname] error:', err);
    return { code: 500, message: '更新失败：' + (err.message || '未知错误') };
  }
};
