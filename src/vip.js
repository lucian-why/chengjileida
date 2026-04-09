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

const VIP_STATE_KEY = 'cjradar_vip_state';
const QUOTA_PREFIX = 'cjradar_vip_quota_';
const USED_CODES_KEY = 'cjradar_vip_used_codes';

// ==================== 限制配置 ====================

export const LIMITS = {
    aiAnalysisDaily: 2,
    aiChatDaily: 2,
    maxProfiles: 2,
    recycleBinRestore: false,
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
        if (user.role === 'vip' || user.isAdmin) return true;
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
 * 设置 VIP 状态（邀请码兑换后调用）
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
    switch (type) {
        case 'aiAnalysis': {
            const record = _getQuotaRecord('aiAnalysis');
            const limit = LIMITS.aiAnalysisDaily;
            if (record.count >= limit) {
                return {
                    allowed: false,
                    reason: `今日 AI 分析次数已用完（${limit}/${limit}）`,
                    used: record.count,
                    limit
                };
            }
            return { allowed: true, used: record.count, limit };
        }

        case 'aiChat': {
            const record = _getQuotaRecord('aiChat');
            const limit = LIMITS.aiChatDaily;
            if (record.count >= limit) {
                return {
                    allowed: false,
                    reason: `今日 AI 对话次数已用完（${limit}轮/${limit}）`,
                    used: record.count,
                    limit
                };
            }
            return { allowed: true, used: record.count, limit };
        }

        case 'profileCount': {
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

    const limit = type === 'aiChat' ? LIMITS.aiChatDaily : LIMITS.aiAnalysisDaily;
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

// ==================== 邀请码系统 ====================

const INVITE_CODES = {
    'VIPKPOHY9': { expireAt: null },
    'VIPETYI8U': { expireAt: null },
    'VIP6BEPYK': { expireAt: null },
    'VIPQ4GILS': { expireAt: null },
    'VIP4582HR': { expireAt: null },
    'VIPKGF7M7': { expireAt: null },
    'VIP8WRKXV': { expireAt: null },
    'VIP2QRQYS': { expireAt: null },
    'VIPX0I23W': { expireAt: null },
    'VIP3E37DM': { expireAt: null },
    'VIPXQD5HF': { expireAt: null },
    'VIPF80D8C': { expireAt: null },
    'VIPYRVQTW': { expireAt: null },
    'VIP6M3AWR': { expireAt: null },
    'VIPTCLCHM': { expireAt: null },
    'VIPWRS2VK': { expireAt: null },
    'VIPZP2M3O': { expireAt: null },
    'VIPMJ8XUF': { expireAt: null },
    'VIPUOBSKH': { expireAt: null },
    'VIPS2WFRX': { expireAt: null },
};

/**
 * 兑换邀请码
 * @param {string} code
 * @returns {{ success: boolean, reason?: string, expireAt?: string|null }}
 */
export function redeemInviteCode(code) {
    if (!code || !code.trim()) {
        return { success: false, reason: '请输入邀请码' };
    }

    const trimmed = code.trim().toUpperCase();

    if (isVip()) {
        return { success: false, reason: '您已经是 VIP 用户，无需再次激活' };
    }

    const entry = INVITE_CODES[trimmed];
    if (!entry) {
        return { success: false, reason: '邀请码无效，请检查后重试' };
    }

    if (entry.expireAt && new Date(entry.expireAt).getTime() < Date.now()) {
        return { success: false, reason: '该邀请码已过期' };
    }

    const usedCodes = _readJSON(USED_CODES_KEY, []);
    if (usedCodes.includes(trimmed)) {
        return { success: false, reason: '该邀请码已被使用过' };
    }

    // 激活 VIP 365 天
    const expireAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    setVipStatus({ isVip: true, expireAt });

    usedCodes.push(trimmed);
    _writeJSON(USED_CODES_KEY, usedCodes);

    return { success: true, expireAt };
}
