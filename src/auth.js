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
    phoneLogin as tcbPhoneLogin
} from './cloud-tcb.js';

let initialized = false;
let authEnabled = false;
const listeners = new Set();

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
    if (!isAuthEnabled()) return null;
    return await getTCBCurrentUser();
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

/**
 * 重置密码（忘记密码流程）
 */
export async function resetPassword(email, code, newPassword) {
    if (!isAuthEnabled()) throw new Error('当前环境未启用腾讯云登录');
    return await tcbResetPassword(normalizeEmail(email), code, newPassword);
}

export async function verifyToken() {
    if (!isAuthEnabled()) return null;
    return await verifyTCBToken();
}

export async function signOut() {
    await signOutTCB();
    emitAuthChange('SIGNED_OUT', { user: null, token: null });
}

export function onAuthStateChange(callback) {
    if (typeof callback !== 'function') return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
}
