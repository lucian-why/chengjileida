const cloud = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;

function generateToken(uid, identifier) {
  const tokenData = JSON.stringify({ uid, identifier, ts: Date.now() });
  return crypto.createHash('sha256').update(tokenData + (process.env.TOKEN_SALT || 'cjld-secret-2026')).digest('hex');
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

/**
 * 手机号 + 验证码 + 密码 注册
 */
exports.main = async (event, context) => {
  let { phone, code, password } = event;

  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '手机号格式不正确' };
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { code: 400, message: '验证码格式不正确（需6位数字）' };
  }
  if (!password || typeof password !== 'string') {
    return { code: 400, message: '请设置密码' };
  }
  if (password.length < 6) {
    return { code: 400, message: '密码至少需要6个字符' };
  }

  try {
    const existingUser = await db.collection('users').where({ phone }).limit(1).get();
    if (existingUser.data && existingUser.data.length > 0) {
      return { code: 409, message: '该手机号已注册，请直接登录' };
    }

    const codeRecord = await consumeSmsCode(phone, code);
    if (!codeRecord) {
      return { code: 401, message: '验证码错误或已过期' };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createResult = await db.collection('users').add({
      phone,
      phoneVerified: true,
      passwordHash,
      nickname: phone,
      avatarUrl: null,
      email: null,
      emailVerified: false,
      weixinOpenid: null,
      weixinUnionid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
      loginCount: 1,
      status: 'active',
      profileCount: 0
    });

    const userId = createResult.id;
    const token = await updateLoginState(userId, 'phone_register');

    console.log('[phoneRegister] 新用户注册:', phone);

    return {
      code: 0,
      message: '注册成功',
      data: {
        token,
        user: { id: userId, phone, nickname: phone, avatarUrl: null, hasWeixin: false, hasPhone: true },
        expiresIn: 2592000
      }
    };

  } catch (err) {
    console.error('[phoneRegister] error:', err);
    return { code: 500, message: '注册失败：' + (err.message || '未知错误') };
  }
};
