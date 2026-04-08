/**
 * auth.js — 认证中间层
 *
 * 职责：封装 cloud-tcb.js 的认证能力，提供统一的 auth API 给业务代码使用
 *
 * 对外暴露：
 *   - initSupabase() / isAuthEnabled()
 *   - sendEmailCode(email)           — 发送邮箱验证码
 *   - sendSmsCode(phone)             — 发送短信验证码（家长用）
 *   - emailLogin(email, code)        — 验证码登录/注册（兼容旧接口名）
 *   - emailCodeLogin(email, code, [pwd]) — 验证码登录/注册（新接口，支持可选密码）
 *   - smsLogin(phone, code)          — 短信验证码登录/注册
 *   - passwordLogin(email, pwd)      — 密码登录
 *   - resetPassword(email, code, pwd)— 重置密码
 *   - getCurrentUser() / signOut() / verifyToken()
 */

import {
    initTCB,
    sendEmailCode as sendTCBEmailCode,
    emailCodeLogin as tcbEmailCodeLogin,
    passwordLogin as tcbPasswordLogin,
    resetPassword as tcbResetPassword,
    verifyToken as verifyTCBToken,
    getCurrentUser as getTCBCurrentUser,
    signOut as signOutTCB,
    getTCBEnvId,
    sendSmsCode as sendTCBSmsCode,
    phoneLogin as tcbPhoneLogin,
    phonePasswordLogin as tcbPhonePasswordLogin,
    phoneRegister as tcbPhoneRegister,
    phoneResetPassword as tcbPhoneResetPassword,
    updateNickname as tcbUpdateNickname
} from './cloud-tcb.js';

let initialized = false;
let authEnabled = false;
const listeners = new Set();
const ADMIN_ACCOUNT = 'admin';
const ADMIN_PASSWORD = 'why123456';
const ADMIN_STORAGE_KEY = 'xueji_admin_session';
const ADMIN_ACCESS_TOKEN = 'xueji_admin_token_v1';

function isBrowser() {
    return typeof window !== 'undefined';
}

function buildAdminUser() {
    return {
        id: 'local-admin',
        nickname: '管理员',
        role: 'admin',
        isAdmin: true,
        accessToken: ADMIN_ACCESS_TOKEN,
        email: '',
        phone: '',
        authProvider: 'local-admin'
    };
}

function getStoredAdminUser() {
    if (!isBrowser()) return null;
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed?.isAdmin) return parsed;
    } catch {}
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    return null;
}

function isValidUserShape(user) {
    if (!user || typeof user !== 'object') return false;
    if (user.isAdmin || user.role === 'admin') return true;
    return Boolean(user.id || user.email || user.phone);
}

function saveAdminUser(user) {
    if (!isBrowser()) return;
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(user));
}

function clearAdminUser() {
    if (!isBrowser()) return;
    localStorage.removeItem(ADMIN_STORAGE_KEY);
}

function isAdminAccount(account) {
    return String(account || '').trim().toLowerCase() === ADMIN_ACCOUNT;
}

function hasAuthConfig() {
    return Boolean(getTCBEnvId()) && import.meta.env.VITE_ENABLE_AUTH !== 'false';
}

function emitAuthChange(event, payload = {}) {
    listeners.forEach((listener) => {
        try { listener(event, payload); }
        catch (error) { console.warn('[auth] 监听登录状态变更失败：', error); }
    });
}

export function normalizeEmail(email) {
    const raw = String(email || '').trim().toLowerCase();
    if (!raw) throw new Error('请输入邮箱');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(raw)) throw new Error('请输入正确的邮箱地址');
    return raw;
}

export function initSupabase() {
    if (initialized) return authEnabled;
    initialized = true;
    authEnabled = hasAuthConfig();
    if (!authEnabled) return null;
    return initTCB();
}

export function isAuthEnabled() {
    if (!initialized) initSupabase();
    return authEnabled;
}

export async function getCurrentUser() {
    const adminUser = getStoredAdminUser();
    if (adminUser) return adminUser;
    if (!isAuthEnabled()) return null;
    const user = await getTCBCurrentUser();
    if (!isValidUserShape(user)) return null;

    if (!user.id && isBrowser()) {
        const storedId = localStorage.getItem(USER_ID_KEY) || '';
        const storedEmail = localStorage.getItem(USER_EMAIL_KEY) || '';
        const hydratedUser = {
            ...user,
            id: storedId || user.id || '',
            email: user.email || storedEmail || ''
        };
        if (isValidUserShape(hydratedUser)) {
            saveAuthSession({ user: hydratedUser });
            return hydratedUser;
        }
    }

    return user;
}

export function isAdminUser(user) {
    return Boolean(user?.isAdmin || user?.role === 'admin');
}

export function getAdminAccessToken() {
    const adminUser = getStoredAdminUser();
    return isAdminUser(adminUser) ? (adminUser.accessToken || ADMIN_ACCESS_TOKEN) : '';
}

/** 发送邮箱验证码 */
export async function sendEmailCode(email) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    return await sendTCBEmailCode(normalizeEmail(email));
}

/** 发送 Magic Link（当前等同于发送验证码） */
export async function sendMagicLink(email) {
    return await sendEmailCode(email);
}

/**
 * 验证码登录/注册（旧接口名，保持向后兼容）
 * 自动判断新用户注册 / 老用户登录
 */
export async function emailLogin(email, code) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbEmailCodeLogin(normalizeEmail(email), code);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

/**
 * 验证码登录/注册（新接口，支持可选密码参数）
 * @param {string} email — 邮箱
 * @param {string} code — 6 位验证码
 * @param {string} [password] — 可选，首次注册时一并设置密码
 */
export async function emailCodeLogin(email, code, password) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbEmailCodeLogin(normalizeEmail(email), code, password);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

/**
 * 密码登录
 * @param {string} email — 邮箱
 * @param {string} password — 密码
 */
export async function passwordLogin(email, password) {
    if (isAdminAccount(email)) {
        if (String(password || '') !== ADMIN_PASSWORD) {
            throw new Error('账号或密码错误');
        }
        const adminUser = buildAdminUser();
        saveAdminUser(adminUser);
        emitAuthChange('SIGNED_IN', { user: adminUser, token: 'local-admin' });
        return { token: 'local-admin', user: adminUser };
    }

    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbPasswordLogin(normalizeEmail(email), password);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

/** 发送短信验证码（给家长用） */
export async function sendSmsCode(phone) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    return await sendTCBSmsCode(phone);
}

/**
 * 短信验证码登录/注册（给家长用，自动判断新用户 vs 老用户）
 * @param {string} phone — 手机号
 * @param {string} code — 6 位验证码
 */
export async function smsLogin(phone, code) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbPhoneLogin(phone, code);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

export async function verifyPhoneOtp(phone, code) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    return await tcbPhoneLogin(phone, code, { silent: true });
}

/**
 * 手机号密码登录
 * @param {string} phone — 手机号
 * @param {string} password — 密码
 */
export async function phonePasswordLogin(phone, password) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbPhonePasswordLogin(phone, password);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

/**
 * 手机号验证码注册（带密码设置）
 * @param {string} phone — 手机号
 * @param {string} code — 验证码
 * @param {string} password — 要设置的密码
 */
export async function phoneRegisterFn(phone, code, password, options = {}) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbPhoneRegister(phone, code, password, options);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

/**
 * 手机号重置密码
 * @param {string} phone — 手机号
 * @param {string} code — 验证码
 * @param {string} newPassword — 新密码
 */
export async function phoneResetPasswordFn(phone, code, newPassword, options = {}) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    const result = await tcbPhoneResetPassword(phone, code, newPassword, options);
    emitAuthChange('SIGNED_IN', { user: result?.user || null, token: result?.token || null });
    return result;
}

/**
 * 更新用户昵称
 * @param {string} userId — 用户ID
 * @param {string} nickname — 新昵称
 */
export async function updateUserNickname(userId, nickname) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    return await tcbUpdateNickname(userId, nickname);
}

/**
 * 重置密码（忘记密码流程）
 */
export async function resetPassword(email, code, newPassword) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    return await tcbResetPassword(normalizeEmail(email), code, newPassword);
}

export async function verifyToken() {
    const adminUser = getStoredAdminUser();
    if (adminUser) return adminUser;
    if (!isAuthEnabled()) return null;
    const user = await verifyTCBToken();
    return isValidUserShape(user) ? user : null;
}

export async function signOut() {
    clearAdminUser();
    if (isAuthEnabled()) {
        await signOutTCB();
    }
    emitAuthChange('SIGNED_OUT', { user: null, token: null });
}

export function onAuthStateChange(callback) {
    if (typeof callback !== 'function') return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
}
