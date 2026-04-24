const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const auth = app.auth();

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
  const { profileId, profileName, profileData, examCount, dataSize, userEmail, deleted, deletedAt } = payload;

  if (!profileId || typeof profileId !== 'string') {
    return { code: 400, message: '缺少 profileId' };
  }
  if (!profileName || typeof profileName !== 'string') {
    return { code: 400, message: '缺少档案名称' };
  }
  if (!profileData || typeof profileData !== 'object') {
    return { code: 400, message: '缺少档案数据' };
  }

  try {
    const current = await getCurrentUser(payload);
    if (current.code !== 0) {
      return current;
    }

    const now = new Date();
    const normalizedExamCount = Number.isFinite(Number(examCount)) ? Number(examCount) : 0;
    const normalizedDataSize = Number.isFinite(Number(dataSize)) ? Number(dataSize) : 0;

    const existing = await db.collection('cloud_profiles')
      .where({
        userId: current.uid,
        profileId
      })
      .limit(1)
      .get();

    if (existing.data && existing.data.length > 0) {
      const currentDoc = existing.data[0];
      await db.collection('cloud_profiles').doc(currentDoc._id).update({
        profileName,
        profileData,
        examCount: normalizedExamCount,
        dataSize: normalizedDataSize,
        userEmail: userEmail || currentDoc.userEmail || '',
        deleted: !!deleted,
        deletedAt: deleted ? (deletedAt || now) : null,
        lastSyncAt: now,
        updatedAt: now
      });

      return {
        code: 0,
        message: '云端档案已更新',
        data: {
          id: currentDoc._id,
          profileId,
          lastSyncAt: now.toISOString()
        }
      };
    }

    const createResult = await db.collection('cloud_profiles').add({
      userId: current.uid,
      userEmail: userEmail || '',
      profileId,
      profileName,
      profileData,
      examCount: normalizedExamCount,
      dataSize: normalizedDataSize,
      deleted: !!deleted,
      deletedAt: deleted ? (deletedAt || now) : null,
      lastSyncAt: now,
      createdAt: now,
      updatedAt: now
    });

    return {
      code: 0,
      message: '云端档案已创建',
      data: {
        id: createResult.id,
        profileId,
        lastSyncAt: now.toISOString()
      }
    };
  } catch (error) {
    console.error('[uploadCloudProfile] error:', error);
    return { code: 500, message: '上传云端档案失败：' + (error.message || '未知错误') };
  }
};
