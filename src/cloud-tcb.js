/**
 * cloud-tcb.js — 腾讯云 Cloudbase 认证层
 *
 * 职责：初始化 TCB SDK、发送验证码、密码登录、验证码注册/登录（自动判断）、Token 管理
 *
 * 架构说明（2026-04-06 重构）：
 *   - 发送验证码：走自建云函数 sendEmailCode（SMTP）
 *   - 验证码注册/登录：走自建云函数 emailRegister（自动判断新用户注册 vs 老用户登录）
 *   - 密码登录：走自建云函数 passwordLogin
 *   - Token 验证：本地 localStorage 读写（与云函数返回的 token 对齐）
 *
 * 依赖：
 *   - @cloudbase/js-sdk（v2，用于发送验证码 + callFunction 调用云函数）
 *
 * 对外暴露：
 *   - initTCB() / getTCBEnvId()
 *   - sendEmailCode(email)        — 通过自建云函数发送邮箱验证码
 *   - emailCodeLogin(email, code)  — 通过云函数完成验证码登录/注册（自动判断）
 *   - passwordLogin(email, pwd)    — 通过云函数完成密码登录
 *   - verifyToken() / getCurrentUser() / signOut()
 *   - saveAuthSession() / clearAuthStorage() / isLoggedIn()
 */

const ENV_ID = import.meta.env.VITE_TCB_ENV_ID || 'chengjileida-8gpex74ea92afd85';
const TOKEN_KEY = 'tcb_token';
const USER_KEY = 'tcb_user';
const USER_ID_KEY = 'tcb_user_id';
const USER_EMAIL_KEY = 'tcb_user_email';

let appInstance = null;
let authInstance = null;
let tcbModulePromise = null;

function isBrowser() {
    return typeof window !== 'undefined';
}

/** 密码最小长度（与云函数 emailRegister / passwordLogin 保持一致） */
const PASSWORD_MIN_LENGTH = 6;


// ===== 工具函数 =====

function normalizeEmail(email) {
    const value = String(email || '').trim().toLowerCase();
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

async function loadCloudbaseModule() {
    if (tcbModulePromise) return tcbModulePromise;
    tcbModulePromise = import(/* @vite-ignore */ '@cloudbase/js-sdk');
    return tcbModulePromise;
}

function buildError(error, fallback) {
    const rawMessage = error?.message || error?.msg || error?.error_description || fallback || '腾讯云服务暂时不可用';
    const message = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage);
    return error instanceof Error ? new Error(message) : new Error(message);
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
        nickname: user.nickname || (user.email ? user.email.split('@')[0] : '云端用户'),
        avatarUrl: user.avatarUrl || null,
        hasWeixin: !!user.hasWeixin,
        hasPhone: !!user.hasPhone
    };
}


// ===== 初始化 =====

export async function initTCB() {
    if (appInstance) return appInstance;
    const cloudbase = await loadCloudbaseModule();
    const sdk = cloudbase.default || cloudbase;
    appInstance = sdk.init({
        env: ENV_ID,
        persistence: 'local'
    });
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

    try {
        const localState = auth.hasLoginState?.() || await auth.getLoginState?.();
        if (localState) return;
    } catch {
        // ignore and fallback to anonymous sign-in
    }

    let lastError = null;

    try {
        const result = await auth.signInAnonymously?.({});
        if (!result?.error) return;
        lastError = result.error;
    } catch (error) {
        lastError = error;
    }

    try {
        const provider = auth.anonymousAuthProvider?.();
        if (provider?.signIn) {
            await provider.signIn();
            return;
        }
    } catch (error) {
        lastError = error;
    }

    throw buildError(lastError, '腾讯云匿名登录初始化失败，请检查 WEB 安全域名与匿名登录配置');
}

export async function callFunction(name, data = {}) {
    const app = await initTCB();
    await ensureCallableAuth();
    try {
        const result = await app.callFunction({ name, data });
        return result?.result ?? result;
    } catch (error) {
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


