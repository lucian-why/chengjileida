const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const auth = app.auth();
const _ = db.command;

const PURGE_DAYS = 30;

function parseEventPayload(event = {}) {
  if (!event || typeof event !== 'object') return {};
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object' && Object.keys(event.queryStringParameters).length > 0) {
    return event.queryStringParameters;
  }
  if (event.queryString && typeof event.queryString === 'object' && Object.keys(event.queryString).length > 0) {
    return event.queryString;
  }
  if (typeof event.body === 'string' && event.body) {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    try {
      return JSON.parse(rawBody);
    } catch {
      return Object.fromEntries(new URLSearchParams(rawBody));
    }
  }
  if (event.body && typeof event.body === 'object') {
    return event.body;
  }
  return event;
}

async function getCurrentUser(event = {}) {
  const payload = parseEventPayload(event);
  const explicitUid = String(payload.userId || payload.uid || '').trim();
  if (explicitUid) {
    return { code: 0, uid: explicitUid, userInfo: { uid: explicitUid } };
  }

  const explicitEmail = String(payload.userEmail || payload.email || '').trim().toLowerCase();
  if (explicitEmail) {
    const matchedUser = await db.collection('users').where({ email: explicitEmail }).limit(1).get();
    const user = matchedUser.data && matchedUser.data[0];
    if (user && user._id) {
      const uid = typeof user._id === 'string' ? user._id : user._id.toString();
      return { code: 0, uid, userInfo: { uid, email: explicitEmail } };
    }
  }

  const userInfo = await auth.getUserInfo();
  const uid = userInfo?.uid || userInfo?.openId || userInfo?.customUserId || '';
  if (!uid) {
    return { code: 401, message: '未获取到当前登录用户，请重新登录' };
  }
  return { code: 0, uid, userInfo };
}

exports.main = async (event = {}) => {
  const payload = parseEventPayload(event);

  let profileIds = payload.profileIds;
  if (typeof profileIds === 'string') {
    try {
      profileIds = JSON.parse(profileIds);
    } catch {
      profileIds = profileIds.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  try {
    if (Array.isArray(profileIds) && profileIds.length > 0) {
      const current = await getCurrentUser(payload);
      if (current.code !== 0) {
        return current;
      }

      const expired = await db.collection('cloud_profiles')
        .where({
          userId: current.uid,
          profileId: _.in(profileIds),
          deleted: true
        })
        .get();

      if (!expired.data || expired.data.length === 0) {
        return { code: 0, message: '没有可彻底删除的档案', data: { count: 0, purgedCount: 0 } };
      }

      let purgedCount = 0;
      for (const doc of expired.data) {
        await db.collection('cloud_profiles').doc(doc._id).remove();
        purgedCount++;
      }

      return {
        code: 0,
        message: '已彻底删除选中的云端档案',
        data: { count: purgedCount, purgedCount }
      };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PURGE_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    const expired = await db.collection('cloud_profiles')
      .where({
        deleted: true,
        deletedAt: db.command.lte(cutoffISO)
      })
      .limit(100)
      .get();

    if (!expired.data || expired.data.length === 0) {
      return { code: 0, message: '无需清理', data: { purgedCount: 0 } };
    }

    let purgedCount = 0;
    for (const doc of expired.data) {
      try {
        await db.collection('cloud_profiles').doc(doc._id).remove();
        purgedCount++;
      } catch (e) {
        console.warn(`[purgeDeletedProfiles] 删除 ${doc._id} 失败:`, e.message);
      }
    }

    return {
      code: 0,
      message: `已清理 ${purgedCount} 条过期删除记录`,
      data: { purgedCount }
    };
  } catch (error) {
    console.error('[purgeDeletedProfiles] error:', error);
    return { code: 500, message: '清理失败：' + (error.message || '未知错误') };
  }
};
