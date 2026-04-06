const cloud = require('@cloudbase/node-sdk');
const crypto = require('crypto');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();
const _ = db.command;
const auth = app.auth();

/**
 * 手机号验证码登录/注册
 * - 校验验证码是否正确且未使用、未过期
 * - 标记验证码为已用
 * - 查找或创建用户
 * - 返回自定义 token
 */
exports.main = async (event, context) => {
  const { phone, code } = event;

  // 1. 校验参数
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '手机号格式不正确' };
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { code: 400, message: '验证码格式不正确' };
  }

  try {
    // 2. 查找有效验证码
    const codeRecord = await db.collection('sms_codes')
      .where({
        phone,
        code,
        used: false,
        expireAt: _.gte(new Date())
      })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (!codeRecord.data || codeRecord.data.length === 0) {
      return { code: 401, message: '验证码错误或已过期' };
    }

    // 3. 标记验证码为已使用
    await db.collection('sms_codes')
      .doc(codeRecord.data[0]._id)
      .update({ used: true, usedAt: new Date() });

    // 4. 查找用户是否存在
    const existingUser = await db.collection('users')
      .where({ phone })
      .limit(1)
      .get();

    let user;
    if (existingUser.data && existingUser.data.length > 0) {
      // 更新登录时间
      user = existingUser.data[0];
      await db.collection('users').doc(user._id).update({
        lastLoginAt: new Date(),
        loginCount: _.inc(1)
      });
    } else {
      // 创建新用户
      const createResult = await db.collection('users').add({
        phone,
        createdAt: new Date(),
        lastLoginAt: new Date(),
        loginCount: 1
      });
      user = { _id: createResult.id, phone, loginCount: 1 };
    }

    // 5. 生成自定义 Token（简单实现，生产环境建议用 JWT）
    const tokenData = JSON.stringify({
      uid: typeof user._id === 'object' ? user._id.toString() : user._id,
      phone,
      ts: Date.now()
    });
    const token = crypto.createHash('sha256').update(tokenData + process.env.TOKEN_SALT || 'cjld-secret-2024').digest('hex');

    // 存储 token 到 users 表（用于 verifyToken 校验）
    await db.collection('users')
      .doc(typeof user._id === 'string' ? user._id : user._id)
      .update({
        token,
        tokenExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天有效期
      });

    return {
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user._id,
          phone
        },
        expiresIn: 2592000 // 30天（秒）
      }
    };

  } catch (err) {
    console.error('phoneLogin error:', err);
    return { code: 500, message: '登录失败：' + (err.message || '未知错误') };
  }
};
