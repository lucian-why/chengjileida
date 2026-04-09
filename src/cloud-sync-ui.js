import { getCurrentUser, isAuthEnabled } from './auth.js';
import { showConfirmDialog, showToast } from './modal.js';
import { listDeletedProfiles, restoreCloudProfiles, purgeDeletedProfiles } from './cloud-sync.js';
import { checkLimit as checkVipLimit } from './vip.js';

let _refreshAll = null;
let _ensureCloudAuth = null;
let _modalMounted = false;
let _loading = false;
let _selectedLocal = new Set();
let _selectedCloud = new Set();
let _latestCloudProfiles = [];

export function setDependencies({ refreshAll, ensureCloudAuth }) {
    _refreshAll = refreshAll;
    _ensureCloudAuth = ensureCloudAuth;
}

function formatBytes(size) {
    if (!size) return '0 KB';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(value) {
    if (!value) return '未同步';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未同步';
    return date.toLocaleString('zh-CN', { hour12: false });
}

function getStatusBadge(status) {
    if (status === 'synced') return '<span class="cloud-sync-badge success">已同步</span>';
    if (status === 'different') return '<span class="cloud-sync-badge warning">有差异</span>';
    return '<span class="cloud-sync-badge muted">仅本地</span>';
}

function ensureModal() {
    if (_modalMounted) return;

    const overlay = document.createElement('div');
    overlay.id = 'cloudSyncOverlay';
    overlay.className = 'cloud-sync-overlay';
    overlay.innerHTML = `
        <div class="cloud-sync-modal">
            <div class="cloud-sync-header">
                    <div>
                        <h3>🗑️ 回收站</h3>
                        <p id="cloudSyncSubtitle">已删除的档案可在此恢复，超过30天将自动彻底删除。</p>
                </div>
                <button type="button" class="cloud-sync-close" id="cloudSyncClose">×</button>
            </div>
            <div class="cloud-sync-status" id="cloudSyncStatus"></div>
            <div class="cloud-sync-body" id="cloudSyncBody"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeCloudSyncPanel();
        }
    });

    document.getElementById('cloudSyncClose')?.addEventListener('click', closeCloudSyncPanel);
    _modalMounted = true;
}

function setStatus(message = '', type = '') {
    const status = document.getElementById('cloudSyncStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}

function renderLoginRequired() {
    const body = document.getElementById('cloudSyncBody');
    if (!body) return;

    body.innerHTML = `
        <div class="cloud-sync-empty">
            <div class="cloud-sync-empty-icon">🔐</div>
            <div class="cloud-sync-empty-title">回收站需要先登录</div>
            <div class="cloud-sync-empty-desc">登录后可查看和管理已删除的云端档案。</div>
            <button type="button" class="cloud-sync-primary" id="cloudSyncLoginBtn">去登录</button>
        </div>
    `;

    document.getElementById('cloudSyncLoginBtn')?.addEventListener('click', async () => {
        if (_ensureCloudAuth) {
            await _ensureCloudAuth();
        }
    });
}

function renderRecycleList(user, deletedProfiles) {
    const body = document.getElementById('cloudSyncBody');
    if (!body) return;

    const listHtml = deletedProfiles.length > 0 ? deletedProfiles.map(profile => {
        const daysLeft = profile.deletedAt ? Math.max(0, 30 - Math.floor((Date.now() - new Date(profile.deletedAt).getTime()) / 86400000)) : 30;
        return `
            <label class="cloud-sync-item">
                <input type="checkbox" data-kind="deleted" data-id="${profile.profileId}" ${_selectedCloud.has(profile.profileId) ? 'checked' : ''}>
                <div class="cloud-sync-item-main">
                    <div class="cloud-sync-item-title">${profile.profileName}</div>
                    <div class="cloud-sync-item-meta">${profile.examCount} 场考试 · ${formatBytes(profile.dataSize)}</div>
                    <div class="cloud-sync-item-sub">删除时间：${formatTime(profile.deletedAt)} · 剩余 ${daysLeft} 天后彻底删除</div>
                </div>
            </label>
        `;
    }).join('') : '<div class="cloud-sync-empty-list">回收站是空的，没有已删除的档案</div>';

    body.innerHTML = `
        <div class="cloud-sync-user">当前账户：${user?.email || '未登录'}</div>
        <section class="cloud-sync-column">
            <div class="cloud-sync-column-header">
                <div>
                    <h4>🗑️ 已删除的档案</h4>
                    <p>共 ${deletedProfiles.length} 个档案</p>
                </div>
                ${deletedProfiles.length > 0 ? '<button type="button" class="cloud-sync-link" id="selectAllDeletedBtn">全选</button>' : ''}
            </div>
            <div class="cloud-sync-list">${listHtml}</div>
        </section>
        ${deletedProfiles.length > 0 ? `
        <div class="cloud-sync-actions">
            <button type="button" class="cloud-sync-primary" id="restoreCloudBtn" ${_loading ? 'disabled' : ''}>恢复选中档案</button>
            <button type="button" class="cloud-sync-danger" id="permanentDeleteBtn" ${_loading ? 'disabled' : ''}>彻底删除选中</button>
        </div>` : ''}
    `;

    body.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', () => {
            if (input.checked) {
                _selectedCloud.add(input.dataset.id);
            } else {
                _selectedCloud.delete(input.dataset.id);
            }
        });
    });

    document.getElementById('selectAllDeletedBtn')?.addEventListener('click', () => {
        _selectedCloud = new Set(deletedProfiles.map(item => item.profileId));
        renderRecycleList(user, deletedProfiles);
    });

    document.getElementById('restoreCloudBtn')?.addEventListener('click', async () => {
        if (!_selectedCloud.size) {
            setStatus('请先选择要恢复的档案', 'warning');
            return;
        }
        await handleRestore(Array.from(_selectedCloud));
    });

    document.getElementById('permanentDeleteBtn')?.addEventListener('click', async () => {
        if (!_selectedCloud.size) {
            setStatus('请先选择要彻底删除的档案', 'warning');
            return;
        }
        await handlePermanentDelete(Array.from(_selectedCloud), deletedProfiles);
    });
}

async function renderCloudSyncContent() {
    ensureModal();
    const overlay = document.getElementById('cloudSyncOverlay');
    overlay?.classList.add('active');

    if (!isAuthEnabled()) {
        setStatus('当前环境未启用腾讯云登录，请先配置 TCB 环境变量。', 'error');
        renderLoginRequired();
        return;
    }

    const user = await getCurrentUser();
    if (!user) {
        setStatus('该功能需要登录后才能使用。', 'info');
        renderLoginRequired();
        return;
    }

    setStatus('正在读取回收站…', 'pending');
    try {
        _latestCloudProfiles = await listDeletedProfiles();
        setStatus(_latestCloudProfiles.length ? '以下档案已被删除，可恢复或彻底删除。' : '回收站是空的，没有已删除的档案。', _latestCloudProfiles.length ? 'success' : 'info');
        renderRecycleList(user, _latestCloudProfiles);
    } catch (error) {
        setStatus(error.message || '云端同步面板加载失败', 'error');
        document.getElementById('cloudSyncBody').innerHTML = '<div class="cloud-sync-empty"><div class="cloud-sync-empty-icon">⚠️</div><div class="cloud-sync-empty-title">回收站暂时不可用</div><div class="cloud-sync-empty-desc">请检查云函数权限或网络配置后重试。</div></div>';
    }
}

async function handleRestore(profileIds) {
    // VIP 限制检查
    const restoreCheck = checkVipLimit('recycleBinRestore');
    if (!restoreCheck.allowed) {
        showToast({
            icon: '🔒',
            iconType: 'warning',
            title: '恢复需要 VIP',
            message: restoreCheck.reason
        });
        return;
    }

    _loading = true;
    setStatus('正在恢复档案…', 'pending');
    try {
        const count = await restoreCloudProfiles(profileIds);
        _selectedCloud.clear();
        await renderCloudSyncContent();
        if (_refreshAll) await _refreshAll();
        setStatus(`已恢复 ${count} 个档案，数据将自动同步到本地。`, 'success');
    } catch (error) {
        setStatus(error.message || '恢复失败', 'error');
    } finally {
        _loading = false;
    }
}

async function handlePermanentDelete(profileIds, deletedProfiles) {
    const names = deletedProfiles.filter(item => profileIds.includes(item.profileId)).map(item => item.profileName).join('、');
    showConfirmDialog({
        icon: '⚠️',
        iconType: 'danger',
        title: '彻底删除？',
        message: `此操作不可恢复！将永久删除以下档案的所有数据：\n\n${names}`,
        okText: '彻底删除',
        okClass: 'confirm-ok-btn',
        onConfirm: async () => {
            _loading = true;
            setStatus('正在彻底删除…', 'pending');
            try {
                await purgeDeletedProfiles(profileIds);
                _selectedCloud.clear();
                await renderCloudSyncContent();
                setStatus('已彻底删除，数据无法恢复。', 'success');
            } catch (error) {
                setStatus(error.message || '删除失败', 'error');
            } finally {
                _loading = false;
            }
        }
    });
}

export async function openCloudSyncPanel() {
    _selectedLocal = new Set();
    _selectedCloud = new Set();
    await renderCloudSyncContent();
}

export function closeCloudSyncPanel() {
    document.getElementById('cloudSyncOverlay')?.classList.remove('active');
}


