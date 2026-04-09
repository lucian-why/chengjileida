/**
 * cloud-tcb.js — 腾讯云 Cloudbase 认证层
 *
 * 职责：初始化 TCB SDK、发送验证码、密码登录、验证码注册/登录（自动判断）、Token 管理
 *
 * 架构说明（2026-04-06 重构）：
 *   - 发送邮箱验证码：走自建云函数 sendEmailCode（SMTP）
 *   - 发送短信验证码：走自建云函数 sendSmsCode（腾讯云 SMS API）
 *   - 验证码注册/登录（邮箱）：走自建云函数 emailRegister
 *   - 验证码注册/登录（手机）：走自建云函数 phoneLogin
 *   - 密码登录：走自建云函数 passwordLogin
 *   - Token 验证：本地 localStorage 读写（与云函数返回的 token 对齐）
 *
 * 依赖：
 *   - @cloudbase/js-sdk（v2，用于发送验证码 + callFunction 调用云函数）
 *
 * 对外暴露：
 *   - initTCB() / getTCBEnvId()
 *   - sendEmailCode(email)        — 通过自建云函数发送邮箱验证码
 *   - sendSmsCode(phone)          — 通过自建云函数发送短信验证码
 *   - emailCodeLogin(email, code)  — 通过云函数完成邮箱验证码登录/注册
 *   - phoneLogin(phone, code)     — 通过云函数完成手机号验证码登录/注册
 *   - passwordLogin(email, pwd)    — 通过云函数完成密码登录
 *   - verifyToken() / getCurrentUser() / signOut()
 *   - saveAuthSession() / clearAuthStorage() / isLoggedIn()
 */

const ENV_ID = import.meta.env.VITE_TCB_ENV_ID || 'chengjiguanjia-1g1twvrkd736c880';
const ACCESS_KEY = import.meta.env.VITE_TCB_ACCESS_KEY || '';
const HTTP_SERVICE_BASE = import.meta.env.VITE_TCB_SERVICE_BASE || `https://${ENV_ID}.service.tcloudbase.com`;
const TOKEN_KEY = 'tcb_token';
const USER_KEY = 'tcb_user';
const USER_ID_KEY = 'tcb_user_id';
const USER_EMAIL_KEY = 'tcb_user_email';

let appInstance = null;
let authInstance = null;
let tcbModulePromise = null;

const AI_PROVIDER = 'hunyuan-exp';
const AI_MODEL = 'hunyuan-turbos-latest';

function isBrowser() {
    return typeof window !== 'undefined';
}

function normalizeAccountString(value) {
    const raw = String(value || '')
        .replace(/\u3000/g, ' ')
        .trim();

    const normalized = raw
        .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
        .replace(/＠/g, '@')
        .replace(/[。．｡]/g, '.');

    return normalized.replace(/\s+/g, '');
}

/** 密码最小长度（与云函数 emailRegister / passwordLogin 保持一致） */
const PASSWORD_MIN_LENGTH = 6;


// ===== 工具函数 =====

function normalizeEmail(email) {
    const value = normalizeAccountString(email).toLowerCase();
    if (!value) throw new Error('请输入邮箱');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('请输入正确的邮箱地址');
    return value;
}

function normalizeCode(code) {
    const value = String(code || '').trim();
    if (!/^\d{6}$/.test(value)) throw new Error('请输入 6 位验证码');
    return value;
}

function normalizePassword(password) {
    const value = String(password || '');
    if (value.length < PASSWORD_MIN_LENGTH) throw new Error(`密码至少 ${PASSWORD_MIN_LENGTH} 个字符`);
    if (value.length > 64) throw new Error('密码过长');
    return value;
}

function normalizePhone(phone) {
    const value = normalizeAccountString(phone);
    if (!/^1[3-9]\d{9}$/.test(value)) throw new Error('请输入正确的手机号');
    return value;
}

async function loadCloudbaseModule() {
    if (tcbModulePromise) return tcbModulePromise;
    tcbModulePromise = import(/* @vite-ignore */ '@cloudbase/js-sdk');
    return tcbModulePromise;
}

function buildError(error, fallback) {
    const rawMessage = error?.message || error?.msg || error?.error_description || fallback || '腾讯云服务暂时不可用';
    const message = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage);
    const wrapped = error instanceof Error ? new Error(message) : new Error(message);
    // 保留原始错误的自定义属性（如 code / registered 等），供上层判断
    if (error && typeof error === 'object') {
        for (const key of Object.keys(error)) {
            if (key !== 'message' && key !== 'stack') {
                (wrapped)[key] = error[key];
            }
        }
    }
    return wrapped;
}

/**
 * 将云函数返回的用户数据映射为前端统一格式
 */
function mapCloudUser(data) {
    if (!data) return null;
    const user = data.user || data;
    return {
        id: user.id || user._id || '',
        email: user.email || '',
        nickname: user.nickname || (user.email ? user.email.split('@')[0] : (user.phone || '云端用户')),
        avatarUrl: user.avatarUrl || null,
        hasWeixin: !!user.hasWeixin,
        hasPhone: !!user.hasPhone,
        role: user.role || '',
        vipExpireAt: user.vipExpireAt || user.vip_expire_at || null
    };
}


// ===== 初始化 =====

export async function initTCB() {
    if (appInstance) return appInstance;
    const cloudbase = await loadCloudbaseModule();
    const sdk = cloudbase.default || cloudbase;
    const initOptions = {
        env: ENV_ID,
        persistence: 'local'
    };
    if (ACCESS_KEY) {
        initOptions.accessKey = ACCESS_KEY;
    }
    appInstance = sdk.init(initOptions);
    return appInstance;
}

/**
 * 获取持久化的 Auth 实例（单例，避免重复初始化导致 scope 丢失）
 */
async function getAuth() {
    if (authInstance) return authInstance;
    const app = await initTCB();
    authInstance = app.auth({ persistence: 'local' });
    return authInstance;
}

export function getTCBEnvId() {
    return ENV_ID;
}

export function getTCBServiceBase() {
    return HTTP_SERVICE_BASE;
}


// ===== 存储层 =====

export function getStoredToken() {
    return isBrowser() ? localStorage.getItem(TOKEN_KEY) || '' : '';
}

export function getStoredUser() {
    if (!isBrowser()) return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch { clearAuthStorage(); return null; }
}

export function clearAuthStorage() {
    if (!isBrowser()) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
}

export function saveAuthSession({ token, user }) {
    if (!isBrowser()) return;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        if (user.id) localStorage.setItem(USER_ID_KEY, user.id);
        if (user.email) localStorage.setItem(USER_EMAIL_KEY, user.email);
    }
}

export function isLoggedIn() {
    return Boolean(getStoredUser());
}

async function ensureCallableAuth() {
    const auth = await getAuth();
    console.log('[cloud-tcb] ensureCallableAuth: auth 实例已获取');

    try {
        const localState = auth.hasLoginState?.() || await auth.getLoginState?.();
        console.log('[cloud-tcb] ensureCallableAuth: 本地登录状态:', localState ? '已登录' : '未登录');
        if (localState) return;
    } catch (e) {
        console.warn('[cloud-tcb] ensureCallableAuth: 检查登录状态异常:', e.message || e);
        // ignore and fallback to anonymous sign-in
    }

    let lastError = null;

    try {
        console.log('[cloud-tcb] ensureCallableAuth: 尝试匿名登录 signInAnonymously...');
        const result = await auth.signInAnonymously?.({});
        if (!result?.error) {
            console.log('[cloud-tcb] ensureCallableAuth: 匿名登录成功');
            return;
        }
        lastError = result.error;
        console.warn('[cloud-tcb] ensureCallableAuth: signInAnonymously 返回错误:', lastError);
    } catch (error) {
        lastError = error;
        console.warn('[cloud-tcb] ensureCallableAuth: signInAnonymously 异常:', error.message || error);
    }

    try {
        const provider = auth.anonymousAuthProvider?.();
        if (provider?.signIn) {
            await provider.signIn();
            console.log('[cloud-tcb] ensureCallableAuth: provider.signIn 匿名登录成功');
            return;
        }
    } catch (error) {
        lastError = error;
        console.warn('[cloud-tcb] ensureCallableAuth: provider.signIn 异常:', error.message || error);
    }

    throw buildError(lastError, '腾讯云匿名登录初始化失败，请检查 WEB 安全域名与匿名登录配置');
}

function shouldFallbackToHttp(error) {
    const message = String(error?.message || error || '');
    return /PERMISSION_DENIED|OPERATION_FAIL|匿名登录初始化失败|signInAnonymously|not authorized|network request error|failed to fetch|fetch failed/i.test(message);
}

async function callHttpFunction(name, data = {}) {
    if (!isBrowser() || typeof fetch !== 'function') {
        throw new Error('当前环境不支持 HTTP 云函数调用');
    }

    const httpPathMap = {
        restoreCloudProfiles: 'restoreDeletedProfiles'
    };

    const queryModeFunctions = new Set([
        'sendEmailCode',
        'emailLogin',
        'emailRegister',
        'passwordLogin',
        'phonePasswordLogin',
        'phoneRegister',
        'resetPassword',
        'phoneResetPassword',
        'updateNickname',
        'listCloudProfiles',
        'getCloudProfileData'
    ]);

    const endpoint = new URL(`${HTTP_SERVICE_BASE}/${httpPathMap[name] || name}`);
    const requestInit = { method: 'POST', headers: {} };

    if (queryModeFunctions.has(name)) {
        Object.entries(data || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                endpoint.searchParams.set(key, String(value));
            }
        });
        if (name === 'sendEmailCode') {
            requestInit.method = 'GET';
        }
    } else {
        requestInit.headers['Content-Type'] = 'application/json';
        requestInit.body = JSON.stringify(data);
    }

    const response = await fetch(endpoint.toString(), requestInit);

    const text = await response.text();
    let parsed = null;

    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(text || 'HTTP 云函数返回了无法解析的内容');
    }

    if (!response.ok && !parsed) {
        throw new Error(`HTTP ${response.status}`);
    }

    return parsed;
}

export async function callFunction(name, data = {}) {
    const app = await initTCB();
    console.log(`[cloud-tcb] callFunction 开始调用云函数: ${name}`, JSON.stringify(data).slice(0, 200));

    try {
        await ensureCallableAuth();
        console.log(`[cloud-tcb] ensureCallableAuth 完成，准备发送请求...`);
        const result = await app.callFunction({ name, data });
        console.log(`[cloud-tcb] 云函数 ${name} 返回:`, JSON.stringify(result?.result ?? result).slice(0, 500));
        return result?.result ?? result;
    } catch (error) {
        if (shouldFallbackToHttp(error)) {
            console.warn(`[cloud-tcb] 云函数 ${name} 触发 HTTP 回退:`, error?.message || error);
            try {
                const httpResult = await callHttpFunction(name, data);
                console.log(`[cloud-tcb] 云函数 ${name} HTTP 返回:`, JSON.stringify(httpResult).slice(0, 500));
                return httpResult;
            } catch (httpError) {
                console.error(`[cloud-tcb] 云函数 ${name} HTTP 回退失败:`, httpError);
                throw buildError(httpError, 'HTTP 云函数调用失败');
            }
        }

        console.error(`[cloud-tcb] 云函数 ${name} 调用异常:`, error);
        throw buildError(error, '云函数调用失败');
    }
}

// ===== 发送验证码（走自建云函数） =====

/**
 * 通过自建云函数发送邮箱验证码
 * 验证码生命周期由 email_codes 集合控制，避免依赖官方 Auth SDK 的内部 scope 状态
 */
export async function sendEmailCode(email) {
    const normalizedEmail = normalizeEmail(email);

    try {
        const result = await callFunction("sendEmailCode", { email: normalizedEmail });

        if (result.code !== 0) {
            switch (result.code) {
                case 400:
                    throw new Error(result.message || "请输入正确的邮箱地址");
                case 429:
                    throw new Error(result.message || "操作过于频繁，请稍后再试");
                case 502:
                case 503:
                    throw new Error(result.message || "邮件服务暂时不可用，请稍后再试");
                default:
                    throw new Error(result.message || "验证码发送失败");
            }
        }

        console.log("[cloud-tcb] 验证码已发送至:", normalizedEmail);
        return result;
    } catch (error) {
        throw buildError(error, "验证码发送失败");
    }
}


// ===== 验证码登录/注册（走云函数 emailRegister） =====

/**
 * 用邮箱 + 验证码完成登录或注册
 * 云函数会自动判断：新用户 → 注册并设密码；老用户 → 直接登录
 *
 * @param {string} email — 邮箱
 * @param {string} code — 6 位验证码
 * @param {string} [password] — 可选，首次注册时可同时设置密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function emailCodeLogin(email, code, password) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = normalizeCode(code);

    const payload = { email: normalizedEmail, code: normalizedCode };
    // 密码可选：传了就一并设置，不传则只做验证码登录（后续可再用 resetPassword 设密码）
    if (password) {
        payload.password = normalizePassword(password);
    }

    try {
        const result = await callFunction('emailRegister', payload);

        if (result.code !== 0) {
            // 映射常见错误码为友好提示
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error('验证码错误或已过期，请重新发送');
                case 409: throw new Error('该邮箱已注册，请使用密码登录或直接用验证码登录');
                default: throw new Error(result.message || '操作失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log(`[cloud-tcb] ${result.message || '验证码登录成功'}:`, normalizedEmail);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '验证码操作失败');
    }
}


// ===== 发送短信验证码（走 TCB 内置 SDK） =====

/**
 * 通过 TCB Auth SDK 的 signInWithOtp 发送短信验证码
 * 流程：signInWithOtp({ phone }) → 返回 pending 对象（含 verifyOtp）
 * 需要在 TCB 控制台 → 身份认证 → 勾选「短信验证码」
 * 注意：短信验证码功能目前仅支持「上海」地域 (ap-shanghai)
 *
 * @param {string} phone — 手机号（11位，不需要带 +86）
 */
export async function sendSmsCode(phone) {
    const normalizedPhone = normalizePhone(phone);

    try {
        const auth = await getAuth();

        // signInWithOtp 会发送验证码，返回的对象包含 verifyOtp 方法用于后续验证登录
        const result = await auth.signInWithOtp({
            phone: normalizedPhone  // SDK 内部会处理区号
        });

        if (result?.error) {
            const msg = result.error.message || result.error.msg || '';
            if (msg.includes('频率') || msg.includes('Frequency') || msg.includes('频繁')) {
                throw new Error('操作过于频繁，请60秒后重试');
            }
            throw new Error(msg || '短信验证码发送失败');
        }

        // 将 pending 验证对象临时保存，供后续 phoneLogin 使用
        _otpPending = result?.data || result;

        console.log("[cloud-tcb] 短信验证码已发送至:", normalizedPhone);
        return result;
    } catch (error) {
        throw buildError(error, "短信验证码发送失败");
    }
}

/** 暂存 signInWithOtp 返回的 pending 对象（用于后续验证码校验+登录） */
let _otpPending = null;


// ===== 短信验证码登录/注册（走 TCB 内置 SDK） =====

/**
 * 用手机号 + 验证码完成登录或注册
 * 走 TCB 的 OTP 验证流程（signInWithOtp 返回的 verifyOpt）
 *
 * @param {string} phone — 手机号（11位）
 * @param {string} code — 6 位验证码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function phoneLogin(phone, code, options = {}) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedCode = normalizeCode(code);

    try {
        let verifyResult;
        if (_otpPending && _otpPending.verifyOtp) {
            verifyResult = await _otpPending.verifyOtp({ token: normalizedCode });
            _otpPending = null;
        } else {
            const auth = await getAuth();
            verifyResult = await auth.verifyOtp({
                phone: normalizedPhone,
                token: normalizedCode
            });
        }

        if (verifyResult?.error) {
            const msg = verifyResult.error.message || verifyResult.error.msg || '';
            if (msg.includes('验证码') || msg.includes('code') || msg.includes('token')) {
                throw new Error('验证码错误或已过期，请重新发送');
            }
            throw new Error(msg || '登录失败');
        }

        const result = await callFunction('phoneLogin', {
            phone: normalizedPhone,
            verified: true
        });

        if (result.code !== 0) {
            switch (result.code) {
                case 404: {
                    const err = new Error(result.message || '该手机号尚未注册');
                    err.code = 'NOT_REGISTERED';
                    err.registered = false;
                    err.account = normalizedPhone;
                    throw err;
                }
                case 401:
                    throw new Error('验证码错误或已过期，请重新发送');
                default:
                    throw new Error(result.message || '验证码登录失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        if (!options.silent) {
            saveAuthSession({ token: result.data.token, user });
        }

        console.log(`[cloud-tcb] 短信登录成功:`, normalizedPhone);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '短信登录失败');
    }
}


// ===== 密码登录（走云函数 passwordLogin） =====

/**
 * 用邮箱 + 密码登录（不需要验证码）
 *
 * @param {string} email — 邮箱
 * @param {string} password — 密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function passwordLogin(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = normalizePassword(password);

    try {
        const result = await callFunction('passwordLogin', {
            email: normalizedEmail,
            password: normalizedPassword
        });

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error('邮箱或密码错误');
                case 402: throw new Error('该账号尚未设置密码，请使用验证码登录');
                case 403: throw new Error('该账号已被禁用，请联系客服');
                default: throw new Error(result.message || '登录失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log('[cloud-tcb] 密码登录成功:', normalizedEmail);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '密码登录失败');
    }
}


// ===== 手机号密码登录（走云函数 phonePasswordLogin） =====

/**
 * 用手机号 + 密码登录（不需要验证码）
 *
 * @param {string} phone — 手机号（11位）
 * @param {string} password — 密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function phonePasswordLogin(phone, password) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedPassword = normalizePassword(password);

    console.log(`[cloud-tcb] phonePasswordLogin 被调用: phone=${normalizedPhone}`);

    try {
        const result = await callFunction('phonePasswordLogin', {
            phone: normalizedPhone,
            password: normalizedPassword
        });

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error(result.message || '手机号或密码错误');
                case 402: throw new Error(result.message || '该账号尚未设置密码，请使用验证码登录');
                case 403: throw new Error(result.message || '该账号已被禁用');
                case 404:
                    // 未注册 —— 返回特殊标记让前端处理
                    const err = new Error(result.message || '该账号尚未注册');
                    err.code = 'NOT_REGISTERED';
                    err.registered = false;
                    throw err;
                default: throw new Error(result.message || '登录失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log('[cloud-tcb] 手机号密码登录成功:', normalizedPhone);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '手机号密码登录失败');
    }
}


// ===== 手机号验证码注册（走云函数 phoneRegister） =====

/**
 * 用手机号 + 验证码 + 密码 注册
 *
 * @param {string} phone — 手机号（11位）
 * @param {string} code — 6位验证码
 * @param {string} password — 要设置的密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function phoneRegister(phone, code, password, options = {}) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedPassword = normalizePassword(password);
    const payload = {
        phone: normalizedPhone,
        password: normalizedPassword
    };

    if (options.verified) {
        payload.verified = true;
    } else {
        payload.code = normalizeCode(code);
    }

    try {
        const result = await callFunction('phoneRegister', payload);

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error('验证码错误或已过期，请重新发送');
                case 409: throw new Error(result.message || '该手机号已注册，请直接登录');
                default: throw new Error(result.message || '注册失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log('[cloud-tcb] 手机号注册成功:', normalizedPhone);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '注册操作失败');
    }
}


// ===== 手机号重置密码（走云函数 phoneResetPassword） =====

/**
 * 通过手机号 + 验证码重置密码
 *
 * @param {string} phone — 手机号
 * @param {string} code — 6位验证码
 * @param {string} newPassword — 新密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function phoneResetPassword(phone, code, newPassword, options = {}) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedPassword = normalizePassword(newPassword);
    const payload = {
        phone: normalizedPhone,
        newPassword: normalizedPassword
    };

    if (options.verified) {
        payload.verified = true;
    } else {
        payload.code = normalizeCode(code);
    }

    try {
        const result = await callFunction('phoneResetPassword', payload);

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error('验证码错误或已过期');
                case 404: throw new Error(result.message || '该手机号未注册');
                default: throw new Error(result.message || '重置失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log('[cloud-tcb] 手机号密码重置成功:', normalizedPhone);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '密码重置失败');
    }
}


// ===== 更新昵称（走云函数 updateNickname） =====

/**
 * 更新用户昵称
 */
export async function updateNickname(userId, nickname) {
    if (!userId || !nickname) throw new Error('参数不完整');
    if (typeof nickname !== 'string' || nickname.length > 50) {
        throw new Error('昵称长度不能超过50个字符');
    }

    try {
        const result = await callFunction('updateNickname', { userId, nickname });

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '昵称格式不正确');
                case 401: throw new Error('请重新登录后再试');
                default: throw new Error(result.message || '更新失败');
            }
        }

        // 更新本地缓存的用户数据
        const storedUser = getStoredUser();
        if (storedUser) {
            storedUser.nickname = nickname;
            saveAuthSession({ user: storedUser });
        }

        console.log('[cloud-tcb] 昵称已更新:', nickname);
        return result.data;
    } catch (error) {
        throw buildError(error, '昵称更新失败');
    }
}


// ===== 重置密码（走云函数 resetPassword） =====

/**
 * 忘记密码时通过邮箱 + 验证码 + 新密码重置
 *
 * @param {string} email — 邮箱
 * @param {string} code — 6 位验证码
 * @param {string} newPassword — 新密码
 * @returns {Promise<{user: object, token: string}>}
 */
export async function resetPassword(email, code, newPassword) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = normalizeCode(code);
    const normalizedPassword = normalizePassword(newPassword);

    try {
        const result = await callFunction('resetPassword', {
            email: normalizedEmail,
            code: normalizedCode,
            newPassword: normalizedPassword
        });

        if (result.code !== 0) {
            switch (result.code) {
                case 400: throw new Error(result.message || '参数错误');
                case 401: throw new Error('验证码错误或已过期');
                case 404: throw new Error('该邮箱未注册');
                default: throw new Error(result.message || '重置失败');
            }
        }

        const user = mapCloudUser(result.data);
        if (!user?.id) throw new Error('返回结果不完整');

        saveAuthSession({ token: result.data.token, user });

        console.log('[cloud-tcb] 密码重置成功:', normalizedEmail);
        return { token: result.data.token, user };
    } catch (error) {
        throw buildError(error, '密码重置失败');
    }
}


// ===== Token 与会话管理 =====

/**
 * 验证本地存储的 token 是否有效（通过云函数查询）
 * 注意：当前云函数体系没有单独的 verifyToken 接口，
 * 这里先做本地有效性判断，后续可扩展
 */
export async function verifyToken() {
    const localUser = getStoredUser();
    if (!localUser?.id) {
        clearAuthStorage();
        return null;
    }
    // TODO: 后续可加云函数 verifyToken 调用来校验 token 是否过期
    return localUser;
}

/**
 * 从云端刷新当前用户信息（包括 VIP 状态）
 * 在页面加载或需要同步 VIP 状态时调用
 */
export async function refreshUser() {
    const localUser = getStoredUser();
    if (!localUser?.id) return null;

    try {
        const result = await callFunction('verifyToken', { token: getStoredToken() });
        if (!result || result.code !== 0 || !result.data) {
            return localUser;
        }

        const cloudData = result.data.user || result.data;
        // 同步云端 VIP 字段到本地用户对象
        if (cloudData.role) localUser.role = cloudData.role;
        if (cloudData.vipExpireAt || cloudData.vip_expire_at) {
            localUser.vipExpireAt = cloudData.vipExpireAt || cloudData.vip_expire_at;
        }
        if (cloudData.nickname) localUser.nickname = cloudData.nickname;
        if (cloudData.email) localUser.email = cloudData.email;
        if (cloudData.avatarUrl) localUser.avatarUrl = cloudData.avatarUrl;

        saveAuthSession({ user: localUser });
        return localUser;
    } catch (error) {
        console.warn('[cloud-tcb] refreshUser failed:', error);
        return localUser;
    }
}

export async function getCurrentUser() {
    const localUser = getStoredUser();
    if (localUser) return localUser;
    return verifyToken();
}

export async function signOut() {
    try {
        const auth = await getAuth();
        await auth.signOut().catch(() => {});
    } catch {
        // ignore
    }
    clearAuthStorage();
}

export function getCurrentUserId() {
    return isBrowser() ? localStorage.getItem(USER_ID_KEY) || '' : '';
}

export function getCurrentUserEmail() {
    return isBrowser() ? localStorage.getItem(USER_EMAIL_KEY) || '' : '';
}


// ===== AI 直连能力（前端 SDK 调用，不需要云函数中转） =====

/**
 * 获取 CloudBase AI 实例
 * 前端直连 AI，支持 streamText 流式输出
 * 需要在 .env 中配置 VITE_TCB_ACCESS_KEY
 */
export async function getAIInstance() {
    const app = await initTCB();
    return app.ai();
}

/**
 * 流式文本生成 — 前端直连 CloudBase AI
 * @param {Array<{role: string, content: string}>} messages - 对话消息
 * @param {object} [options] - 可选参数
 * @param {number} [options.temperature=0.6] - 采样温度
 * @param {number} [options.maxTokens=600] - 最大生成 token 数
 * @returns {Promise<{textStream: AsyncIterable<string>, dataStream: AsyncIterable, messages: Promise, usage: Promise}>}
 */
export async function streamText(messages, options = {}) {
    const ai = await getAIInstance();
    const model = ai.createModel(AI_PROVIDER);

    return model.streamText({
        model: AI_MODEL,
        messages,
        temperature: options.temperature ?? 0.6,
        maxTokens: options.maxTokens ?? 600
    });
}

/**
 * 非流式文本生成 — 前端直连 CloudBase AI
 * @param {Array<{role: string, content: string}>} messages - 对话消息
 * @param {object} [options] - 可选参数
 * @param {number} [options.temperature=0.4] - 采样温度
 * @param {number} [options.maxTokens=900] - 最大生成 token 数
 * @returns {Promise<string>} 生成的文本
 */
export async function generateText(messages, options = {}) {
    const ai = await getAIInstance();
    const model = ai.createModel(AI_PROVIDER);

    const result = await model.generateText({
        model: AI_MODEL,
        messages,
        temperature: options.temperature ?? 0.4,
        maxTokens: options.maxTokens ?? 900
    });

    if (result?.error) {
        const errorMessage = typeof result.error === 'string'
            ? result.error
            : (result.error?.message || JSON.stringify(result.error));
        throw new Error(errorMessage || 'CloudBase AI 调用失败');
    }

    return result?.text || '';
}


