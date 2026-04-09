const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;


// ===== 主逻辑：校验 Token 有效性 =====

/**
 * 校验 Token 是否有效
 * - 查找匹配 token 且未过期的用户
 * - 返回用户基本信息
 *
 * 请求：{ token }
 */
exports.main = async (event, context) => {
  const { token } = event;

  if (!token || typeof token !== 'string') {
    return { code: 401, message: '未提供有效 Token' };
  }

  try {
    // 查找拥有该 token 且未过期的用户
    const userResult = await db.collection('users')
      .where({
        token,
        tokenExpireAt: _.gte(new Date()),
        status: 'active'
      })
      .limit(1)
      .get();

    if (!userResult.data || userResult.data.length === 0) {
      return { code: 401, message: 'Token 无效或已过期，请重新登录' };
    }

    const user = userResult.data[0];

    return {
      code: 0,
      data: {
        id: user._id,
        email: user.email,
        nickname: user.nickname || user.email.split('@')[0],
        avatarUrl: user.avatarUrl || null,
        hasWeixin: !!user.weixinOpenid,
        hasPhone: !!user.phone,
        lastLoginMethod: user.lastLoginMethod || null,
        createdAt: user.createdAt,
        profileCount: user.profileCount || 0,
        role: user.role || '',
        vipExpireAt: user.vipExpireAt || null
      }
    };

  } catch (err) {
    console.error('[verifyToken] error:', err);
    return { code: 500, message: '校验失败：' + (err.message || '未知错误') };
  }
};
