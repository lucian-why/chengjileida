const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const auth = app.auth();

async function getCurrentUser() {
  const userInfo = await auth.getUserInfo();
  const uid = userInfo?.uid || userInfo?.openId || userInfo?.customUserId || '';
  if (!uid) {
    return { code: 401, message: '未获取到当前登录用户，请重新登录' };
  }
  return { code: 0, uid, userInfo };
}

exports.main = async (event) => {
  try {
    const current = await getCurrentUser();
    if (current.code !== 0) {
      return current;
    }

    const showDeleted = event.showDeleted === true;
    const where = { userId: current.uid };

    // showDeleted=true 时查全部（含已删除），否则只查未删除的
    if (!showDeleted) {
      where.deleted = { $ne: true };
    }

    const result = await db.collection('cloud_profiles')
      .where(where)
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .get();

    const profiles = (result.data || []).map((item) => ({
      id: item._id,
      profileId: item.profileId,
      profileName: item.profileName,
      examCount: item.examCount || 0,
      dataSize: item.dataSize || 0,
      lastSyncAt: item.lastSyncAt || item.updatedAt || item.createdAt || null,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      deleted: item.deleted || false,
      deletedAt: item.deletedAt || item.deleted_at || null
    }));

    return { code: 0, data: profiles };
  } catch (error) {
    console.error('[listCloudProfiles] error:', error);
    return { code: 500, message: '读取云端档案失败：' + (error.message || '未知错误') };
  }
};
