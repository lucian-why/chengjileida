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

async function findUserByPhone(phone) {
  const result = await db.collection('users').where({ phone }).limit(1).get();
  return result.data && result.data.length > 0 ? result.data[0] : null;
}

async function updateLoginState(userId, loginMethod) {
  const tokenData = await db.collection('users').doc(userId).get();
  const user = tokenData.data;
  const identifier = user.phone || user.email;
  const token = generateToken(typeof userId === 'string' ? userId : userId.toString(), identifier);
  await db.collection('users').doc(userId).update({
    token,
    tokenExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天
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
 * 手机号 + 密码登录
 *
 * 请求：{ phone, password }
 *
 * 返回：
 *   - 200: 登录成功 { code:0, data:{ token, user } }
 *   - 401: 手机号或密码错误
 *   - 402: 该账号尚未设置密码，请使用验证码登录
 *   - 403: 账号已被禁用
 *   - 400: 参数错误
 */
exports.main = async (event, context) => {
  const { phone, password } = event;

  // 1. 参数校验
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '手机号格式不正确' };
  }
  if (!password || typeof password !== 'string') {
    return { code: 400, message: '请输入密码' };
  }

  try {
    // 2. 查找用户（同时查 phone 和可能的别名字段）
    console.log('[phonePasswordLogin] 查询手机号:', phone);
    const existingUser = await findUserByPhone(phone);
    console.log('[phonePasswordLogin] 查询结果:', existingUser ? '找到用户 id=' + existingUser._id : '未找到');

    if (!existingUser) {
      // 二次查询：可能用户是通过其他方式注册的（如微信），phone 字段名不同
      const fallbackResult = await db.collection('users')
        .where(_.or([
          { phone },
          { phoneNumber: phone },
          { mobile: phone }
        ]))
        .limit(1)
        .get();
      console.log('[phonePasswordLogin] 二次查询结果:', fallbackResult.data?.length || 0, '条');

      if (fallbackResult.data && fallbackResult.data.length > 0) {
        // 找到了但字段名不同，继续用这个用户
        // ... 这里先不处理，让用户知道有数据
      }

      return { code: 404, registered: false, message: '该账号尚未注册' };
    }

    // 3. 检查是否设过密码
    if (!existingUser.passwordHash) {
      return { code: 402, message: '该账号尚未设置密码，请使用验证码登录' };
    }

    // 4. 检查账号状态
    if (existingUser.status === 'disabled' || existingUser.status === 'banned') {
      return { code: 403, message: '该账号已被禁用，请联系客服' };
    }

    // 5. 校验密码
    const isMatch = await bcrypt.compare(password, existingUser.passwordHash);
    if (!isMatch) {
      return { code: 401, message: '手机号或密码错误' };
    }

    // 6. 更新登录态（30天有效期）
    const token = await updateLoginState(existingUser._id, 'phone_password');

    console.log('[phonePasswordLogin] 密码登录:', phone);

    return {
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: buildUserResponse({ ...existingUser }),
        expiresIn: 2592000 // 30天（秒）
      }
    };

  } catch (err) {
    console.error('[phonePasswordLogin] error:', err);
    return { code: 500, message: '登录失败：' + (err.message || '未知错误') };
  }
};
