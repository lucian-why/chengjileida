/**
 * modal.js — 弹窗系统
 * 来源：index-legacy-v2.html 第 3652-3695 行
 *   - showConfirmDialog (第 3654-3666 行)
 *   - closeConfirmDialog (第 3668-3671 行)
 *   - showToast (第 3674-3695 行)
 *
 * _confirmCallback 原为独立变量（第 3653 行），改为使用 store.state._confirmCallback。
 */

import state from './store.js';

// 通用确认弹窗（替代原生 confirm）
export function showConfirmDialog({ icon, iconType, title, message, okText, okClass, onConfirm }) {
    state._confirmCallback = onConfirm || null;
    const iconEl = document.getElementById('confirmModalIcon');
    const wrapEl = document.getElementById('confirmModalIconWrap');
    if (iconEl) iconEl.textContent = icon || '⚠️';
    if (wrapEl) wrapEl.className = 'confirm-icon-wrap ' + (iconType || 'danger');
    document.getElementById('confirmModalTitle').textContent = title || '确认';
    document.getElementById('confirmModalMessage').textContent = message || '';
    const okBtn = document.getElementById('confirmModalOk');
    okBtn.textContent = okText || '确定';
    okBtn.className = 'btn ' + (okClass || 'confirm-ok-btn');
    document.getElementById('confirmModal').classList.add('active');
}

export function closeConfirmDialog() {
    document.getElementById('confirmModal').classList.remove('active');
    state._confirmCallback = null;
}

// 成功/提示弹窗（替代 alert）
export function showToast({ icon, iconType, title, message, okText, onClose }) {
    const iconEl = document.getElementById('confirmModalIcon');
    const wrapEl = document.getElementById('confirmModalIconWrap');
    iconEl.textContent = icon || '✅';
    wrapEl.className = 'confirm-icon-wrap ' + (iconType || 'success');
    document.getElementById('confirmModalTitle').textContent = title || '成功';
    document.getElementById('confirmModalMessage').textContent = message || '';
    const okBtn = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');
    okBtn.textContent = okText || '好的';
    okBtn.className = 'btn confirm-ok-btn green';
    cancelBtn.style.display = 'none'; // 隐藏取消按钮

    const closeModal = function() {
        document.getElementById('confirmModal').classList.remove('active');
        okBtn.removeEventListener('click', closeModal);
        cancelBtn.style.display = '';
        if (onClose) onClose();
    };
    okBtn.addEventListener('click', closeModal, { once: true });
    document.getElementById('confirmModal').classList.add('active');
}
