/**
 * vip.js — Web 版 VIP 权限模块
 *
 * 限制规则（非VIP）：
 *   - AI 分析：每天 2 次
 *   - AI 对话：每天 2 轮
 *   - 档案数量：每浏览器最多 2 个
 *   - 云同步回收站恢复：不可用
 *
 * 数据存储在 localStorage，key 前缀为 'cjradar_vip_'。
 */

// ==================== 存储键 ====================

import { callFunction } from './cloud-tcb.js';
import { getCurrentUser } from './auth.js';

const VIP_STATE_KEY = 'cjradar_vip_state';
const QUOTA_PREFIX = 'cjradar_vip_quota_';

// ==================== 限制配置 ====================

export const LIMITS = {
    aiAnalysisDaily: 2,
    aiChatDaily: 2,
    maxProfiles: 2,
    recycleBinRestore: false,
    vipAiAnalysisDaily: 30,
    vipAiChatDaily: 50,
};

// ==================== 内部工具 ====================

function _today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function _writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // localStorage 可能满了
        console.warn('[vip] writeJSON failed:', e.message);
    }
}

/**
 * 获取或初始化用量记录对象
 */
function _getQuotaRecord(type) {
    const key = QUOTA_PREFIX + type;
    const record = _readJSON(key, { date: '', count: 0 });

    if (record.date !== _today()) {
        const reset = { date: _today(), count: 0 };
        _writeJSON(key, reset);
        return reset;
    }

    return record;
}

function _saveQuotaRecord(type, record) {
    _writeJSON(QUOTA_PREFIX + type, record);
}

/** 读取 VIP 状态缓存 */
function _getVipState() {
    return _readJSON(VIP_STATE_KEY, { isVip: false, expireAt: null });
}

function _saveVipState(state) {
    _writeJSON(VIP_STATE_KEY, state);
}

// ==================== 公开 API ====================

/**
 * 判断当前用户是否为 VIP
 *
 * @param {Object} [user] — 来自 auth.getCurrentUser()
 * @returns {boolean}
 */
export function isVip(user) {
    // 优先使用传入的用户信息
    if (user) {
        // admin 永久 VIP
        if (user.role === 'admin' || user.isAdmin) return true;
        // 旧版 role='vip' 也视为永久 VIP（兼容历史数据）
        if (user.role === 'vip') return true;
        // 新版按到期时间判断
        if (user.vipExpireAt && new Date(user.vipExpireAt).getTime() > Date.now()) return true;
    }

    // 回退到本地缓存
    const state = _getVipState();
    if (state.isVip) {
        if (!state.expireAt || new Date(state.expireAt).getTime() > Date.now()) {
            return true;
        }
        // 过期了，清除缓存
        _saveVipState({ isVip: false, expireAt: null });
    }

    return false;
}

/**
 * 设置 VIP 状态（兑换码兑换后调用）
 */
export function setVipStatus({ isVip, expireAt }) {
    _saveVipState({ isVip: !!isVip, expireAt: expireAt || null });
}

/**
 * 检查某项功能是否可用
 *
 * @param {'aiAnalysis'|'aiChat'|'profileCount'|'recycleBinRestore'} type
 * @param {number} [currentUsage] — 当前已用量（用于 profileCount）
 * @returns {{ allowed: boolean, reason?: string, used?: number, limit?: number }}
 */
export function checkLimit(type, currentUsage) {
    const userIsVip = isVip();

    switch (type) {
        case 'aiAnalysis': {
            const record = _getQuotaRecord('aiAnalysis');
            const limit = userIsVip ? LIMITS.vipAiAnalysisDaily : LIMITS.aiAnalysisDaily;
            if (record.count >= limit) {
                return {
                    allowed: false,
                    reason: userIsVip ? `为了防止恶意调用，VIP 每日 AI 分析最高限制为 ${limit} 次，您今日已达上限。` : `今日 AI 分析次数已用完（${limit}/${limit}）`,
                    used: record.count,
                    limit
                };
            }
            return { allowed: true, used: record.count, limit };
        }

        case 'aiChat': {
            const record = _getQuotaRecord('aiChat');
            const limit = userIsVip ? LIMITS.vipAiChatDaily : LIMITS.aiChatDaily;
            if (record.count >= limit) {
                return {
                    allowed: false,
                    reason: userIsVip ? `为了防止恶意调用，VIP 每日 AI 对话最高限制为 ${limit} 轮，您今日已达上限。` : `今日 AI 对话次数已用完（${limit}轮/${limit}）`,
                    used: record.count,
                    limit
                };
            }
            return { allowed: true, used: record.count, limit };
        }

        case 'profileCount': {
            if (userIsVip) return { allowed: true, used: currentUsage, limit: Infinity };
            const limit = LIMITS.maxProfiles;
            if (currentUsage >= limit) {
                return {
                    allowed: false,
                    reason: `免费版最多创建 ${limit} 个档案，升级 VIP 解锁更多`,
                    used: currentUsage,
                    limit
                };
            }
            return { allowed: true, used: currentUsage, limit };
        }

        case 'recycleBinRestore': {
            if (userIsVip) return { allowed: true };
            if (!LIMITS.recycleBinRestore) {
                return {
                    allowed: false,
                    reason: '恢复数据需要 VIP，免费版数据将在回收站保留 30 天后自动清除'
                };
            }
            return { allowed: true };
        }

        default:
            return { allowed: true };
    }
}

/**
 * 消耗一次配额
 * @param {'aiAnalysis'|'aiChat'} type
 * @returns {number} 剩余次数
 */
export function consumeQuota(type) {
    const record = _getQuotaRecord(type);
    record.count += 1;
    _saveQuotaRecord(type, record);

    const userIsVip = isVip();
    let limit;
    if (type === 'aiChat') {
        limit = userIsVip ? LIMITS.vipAiChatDaily : LIMITS.aiChatDaily;
    } else {
        limit = userIsVip ? LIMITS.vipAiAnalysisDaily : LIMITS.aiAnalysisDaily;
    }
    return Math.max(0, limit - record.count);
}

/** 重置配额（测试用） */
export function resetQuota(type) {
    localStorage.removeItem(QUOTA_PREFIX + type);
}

/** 获取用量概览 */
export function getQuotaOverview() {
    const aiRecord = _getQuotaRecord('aiAnalysis');
    const chatRecord = _getQuotaRecord('aiChat');

    return {
        isVip: isVip(),
        aiAnalysis: {
            used: aiRecord.count,
            limit: LIMITS.aiAnalysisDaily,
            remaining: Math.max(0, LIMITS.aiAnalysisDaily - aiRecord.count)
        },
        aiChat: {
            used: chatRecord.count,
            limit: LIMITS.aiChatDaily,
            remaining: Math.max(0, LIMITS.aiChatDaily - chatRecord.count)
        },
        limits: { ...LIMITS }
    };
}

// ==================== 兑换码系统（云端校验，一码一人） ====================

/**
 * 兑换 VIP 兑换码 — 调用云函数完成校验 + 激活
 * 校验逻辑全部在服务端，前端只负责传参和更新本地缓存
 *
 * @param {string} code — 用户输入的兑换码
 * @returns {Promise<{ success: boolean, reason?: string, expireAt?: string|null }>}
 */
export async function redeemVipCode(code) {
    if (!code || !code.trim()) {
        return { success: false, reason: '请输入兑换码' };
    }

    try {
        const user = await getCurrentUser();
        if (!user?.id) {
            return { success: false, reason: '请先登录后再兑换' };
        }

        const result = await callFunction('redeemVipCode', {
            code: code.trim().toUpperCase(),
            userId: user.id,
        });

        if (result.code !== 0) {
            return { success: false, reason: result.message || '兑换失败' };
        }

        // 云端已激活成功，更新本地 VIP 缓存
        const expireAt = result.data?.vipExpireAt || null;
        setVipStatus({ isVip: true, expireAt });

        // 同步云端 VIP 字段到本地用户对象
        if (expireAt) user.vipExpireAt = expireAt;
        user.role = result.data?.role || 'month';

        return { success: true, expireAt };

    } catch (error) {
        console.warn('[vip] 兑换码失败:', error?.message || error);
        return { success: false, reason: error?.message || '网络异常，请稍后再试' };
    }
}
