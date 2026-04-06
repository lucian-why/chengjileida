const cloud = require('@cloudbase/node-sdk');
const bcrypt = require('bcryptjs');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();
const _ = db.command;
const crypto = require('crypto');


// ===== 工具函数（从 emailRegister 抽取的公共逻辑） =====

function generateToken(uid, email) {
  const tokenData = JSON.stringify({ uid, email, ts: Date.now() });
  return crypto.createHash('sha256').update(tokenData + (process.env.TOKEN_SALT || 'cjld-secret-2026')).digest('hex');
}

async function consumeEmailCode(email, code) {
  const result = await db.collection('email_codes')
    .where({ email, code, used: false, expireAt: _.gte(new Date()) })
    .orderBy('createdAt', 'desc').limit(1).get();
  if (!result.data || result.data.length === 0) return null;
  await db.collection('email_codes').doc(result.data[0]._id).update({ used: true, usedAt: new Date() });
  return result.data[0];
}

async function findUserByEmail(email) {
  const result = await db.collection('users').where({ email }).limit(1).get();
  return result.data && result.data.length > 0 ? result.data[0] : null;
}

async function updateLoginState(userId, loginMethod) {
  const tokenData = await db.collection('users').doc(userId).get();
  const user = tokenData.data;
  const token = generateToken(typeof userId === 'string' ? userId : userId.toString(), user.email);
  await db.collection('users').doc(userId).update({
    token,
    tokenExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lastLoginMethod: loginMethod,
    lastLoginAt: new Date(),
    loginCount: _.inc(1),
    updatedAt: new Date()
  });
  return token;
}

function buildUserResponse(user) {
  return {
    id: user._id,
    email: user.email,
    nickname: user.nickname || user.email.split('@')[0],
    avatarUrl: user.avatarUrl || null,
    hasWeixin: !!user.weixinOpenid,
    hasPhone: !!user.phone
  };
}


// ===== 主逻辑：邮箱验证码登录（免密码） =====

/**
 * 已有用户通过邮箱+验证码快速登录
 *
 * 请求：{ email, code }
 */
exports.main = async (event, context) => {
  const { email, code } = event;

  // 1. 参数校验
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { code: 400, message: '邮箱格式不正确' };
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { code: 400, message: '验证码格式不正确（需6位数字）' };
  }

  try {
    // 2. 检查用户是否存在
    const existingUser = await findUserByEmail(email);
    if (!existingUser) {
      return { code: 404, message: '该邮箱尚未注册，请先注册' };
    }

    // 3. 检查账号状态
    if (existingUser.status !== 'active') {
      return { code: 403, message: '该账号已被禁用，请联系客服' };
    }

    // 4. 校验并消费验证码
    const codeRecord = await consumeEmailCode(email, code);
    if (!codeRecord) {
      return { code: 401, message: '验证码错误或已过期' };
    }

    // 5. 更新登录态
    const token = await updateLoginState(existingUser._id, 'email_code');

    console.log('[emailLogin] 验证码登录:', email);

    return {
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: buildUserResponse({ ...existingUser }),
        expiresIn: 2592000
      }
    };

  } catch (err) {
    console.error('[emailLogin] error:', err);
    return { code: 500, message: '登录失败：' + (err.message || '未知错误') };
  }
};
