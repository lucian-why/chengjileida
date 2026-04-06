const cloud = require('@cloudbase/node-sdk');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;

function generateToken(uid, identifier) {
  const tokenData = JSON.stringify({ uid, identifier, ts: Date.now() });
  return crypto.createHash('sha256').update(tokenData + (process.env.TOKEN_SALT || 'cjld-secret-2026')).digest('hex');
}

async function consumeSmsCode(phone, code) {
  const result = await db.collection('sms_codes')
    .where({ phone, code, used: false, expireAt: _.gte(new Date()) })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (!result.data || result.data.length === 0) return null;
  await db.collection('sms_codes').doc(result.data[0]._id).update({ used: true, usedAt: new Date() });
  return result.data[0];
}

async function updateLoginState(userId, loginMethod) {
  const tokenData = await db.collection('users').doc(userId).get();
  const user = tokenData.data;
  const identifier = user.phone || user.email;
  const token = generateToken(typeof userId === 'string' ? userId : userId.toString(), identifier);
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
    email: user.email || '',
    nickname: user.nickname || user.phone || '云端用户',
    avatarUrl: user.avatarUrl || null,
    hasWeixin: !!user.weixinOpenid,
    hasPhone: !!user.phone
  };
}

/**
 * 手机号 + 验证码 + 新密码 → 重置密码
 */
exports.main = async (event, context) => {
  let { phone, code, newPassword } = event;

  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '手机号格式不正确' };
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { code: 400, message: '验证码格式不正确（需6位数字）' };
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return { code: 400, message: '请设置新密码' };
  }
  if (newPassword.length < 6) {
    return { code: 400, message: '密码至少需要6个字符' };
  }

  try {
    const existingUser = await db.collection('users').where({ phone }).limit(1).get();
    if (!existingUser.data || existingUser.data.length === 0) {
      return { code: 404, message: '该手机号未注册' };
    }

    const codeRecord = await consumeSmsCode(phone, code);
    if (!codeRecord) {
      return { code: 401, message: '验证码错误或已过期' };
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db.collection('users').doc(existingUser.data[0]._id).update({
      passwordHash,
      updatedAt: new Date()
    });

    const token = await updateLoginState(existingUser.data[0]._id, 'phone_password_reset');

    console.log('[phoneResetPassword] 密码重置成功:', phone);

    return {
      code: 0,
      message: '密码重置成功',
      data: {
        token,
        user: buildUserResponse({ ...existingUser.data[0] }),
        expiresIn: 2592000
      }
    };

  } catch (err) {
    console.error('[phoneResetPassword] error:', err);
    return { code: 500, message: '重置失败：' + (err.message || '未知错误') };
  }
};
