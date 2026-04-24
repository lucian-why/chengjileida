/**
 * vip-ui.js — VIP 状态展示 & 兑换码 UI
 */

import { isVip, getQuotaOverview, redeemVipCode } from './vip.js';
import { getCurrentUser } from './auth.js';
import { showToast } from './modal.js';

let _rendered = false;

/** 初始化并渲染 VIP 区域 */
export function initVipUI() {
    if (_rendered) return;
    _rendered = true;

    const submitBtn = document.getElementById('inviteCodeSubmitBtn');
    const input = document.getElementById('inviteCodeInput');
    const msgEl = document.getElementById('inviteCodeMsg');

    submitBtn?.addEventListener('click', handleRedeem);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleRedeem();
    });

    // 登出/登录时刷新
    document.addEventListener('auth-changed', renderVipStatus);
}

async function handleRedeem() {
    const input = document.getElementById('inviteCodeInput');
    const msgEl = document.getElementById('inviteCodeMsg');
    if (!input || !msgEl) return;

    const code = input.value.trim();
    if (!code) {
        showMsg(msgEl, '请输入兑换码', 'error');
        return;
    }

    const btn = document.getElementById('inviteCodeSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = '兑换中…'; }

    try {
        const result = await redeemVipCode(code);

        if (!result.success) {
            showMsg(msgEl, result.reason || '兑换失败', 'error');
            showToast({ icon: '⚠️', iconType: 'warning', title: '兑换失败', message: result.reason });
            return;
        }

        showMsg(msgEl, `✅ VIP 已激活！有效期至 ${new Date(result.expireAt).toLocaleDateString()}`, 'success');
        input.value = '';
        showToast({
            icon: '🎉',
            iconType: 'success',
            title: 'VIP 兑换成功',
            message: `VIP 有效期至 ${new Date(result.expireAt).toLocaleDateString()}，享受全部高级功能！`
        });

        renderVipStatus();
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '兑换'; }
    }
}

function showMsg(el, text, type = 'info') {
    if (!el) return;
    el.textContent = text;
    el.className = 'vip-invite-msg ' + type;
}

/** 渲染 VIP 状态区域 */
export function renderVipStatus() {
    const statusArea = document.getElementById('vipStatusArea');
    const inviteArea = document.getElementById('vipInviteArea');
    if (!statusArea) return;

    const user = getCurrentUser();
    const vip = isVip(user);
    const overview = getQuotaOverview();

    if (vip) {
        statusArea.innerHTML = `
            <div class="vip-status-badge active">
                <span class="vip-status-icon">👑</span>
                <span class="vip-status-text">VIP 用户 — 全部高级功能已解锁</span>
            </div>
        `;
        if (inviteArea) inviteArea.style.display = 'none';
    } else {
        statusArea.innerHTML = `
            <div class="vip-status-badge free">
                <div class="vip-usage-grid">
                    <div class="vip-usage-item">
                        <span class="vip-usage-label">AI 分析</span>
                        <span class="vip-usage-value">${overview.aiAnalysis.used}/${overview.aiAnalysis.limit}</span>
                    </div>
                    <div class="vip-usage-item">
                        <span class="vip-usage-label">AI 对话</span>
                        <span class="vip-usage-value">${overview.aiChat.used}/${overview.aiChat.limit}</span>
                    </div>
                    <div class="vip-usage-item">
                        <span class="vip-usage-label">档案数</span>
                        <span class="vip-usage-value">≤${overview.limits.maxProfiles}</span>
                    </div>
                </div>
            </div>
        `;
        if (inviteArea) inviteArea.style.display = '';
    }
}
