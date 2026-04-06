import { getCurrentUser, isAuthEnabled } from './auth.js';
import { showConfirmDialog, showToast } from './modal.js';
import { compareProfiles, deleteCloudProfiles, downloadProfiles, getCloudProfiles, getLocalProfileSummaries, uploadProfile } from './cloud-sync.js';

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
                    <h3>☁️ 云端同步</h3>
                    <p id="cloudSyncSubtitle">登录后可备份档案到云端，或从云端恢复数据。</p>
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
            <div class="cloud-sync-empty-title">云端同步需要先登录</div>
            <div class="cloud-sync-empty-desc">登录后可备份本地档案，并在新设备上恢复成绩数据。</div>
            <button type="button" class="cloud-sync-primary" id="cloudSyncLoginBtn">去登录</button>
        </div>
    `;

    document.getElementById('cloudSyncLoginBtn')?.addEventListener('click', async () => {
        if (_ensureCloudAuth) {
            await _ensureCloudAuth();
        }
    });
}

function renderLists(user, localProfiles, cloudProfiles) {
    const body = document.getElementById('cloudSyncBody');
    if (!body) return;

    const compareMap = new Map(compareProfiles(localProfiles, cloudProfiles).map(item => [item.profileId, item]));

    const localHtml = localProfiles.map(profile => {
        const compareItem = compareMap.get(profile.profileId);
        return `
            <label class="cloud-sync-item">
                <input type="checkbox" data-kind="local" data-id="${profile.profileId}" ${_selectedLocal.has(profile.profileId) ? 'checked' : ''}>
                <div class="cloud-sync-item-main">
                    <div class="cloud-sync-item-title">${profile.profileName}</div>
                    <div class="cloud-sync-item-meta">${profile.examCount} 场考试 · ${formatBytes(profile.dataSize)}</div>
                </div>
                ${getStatusBadge(compareItem?.status || 'local-only')}
            </label>
        `;
    }).join('') || '<div class="cloud-sync-empty-list">本地还没有档案</div>';

    const cloudHtml = cloudProfiles.map(profile => {
        const status = compareMap.get(profile.profileId)?.status === 'synced' ? 'synced' : 'different';
        return `
            <label class="cloud-sync-item">
                <input type="checkbox" data-kind="cloud" data-id="${profile.profileId}" ${_selectedCloud.has(profile.profileId) ? 'checked' : ''}>
                <div class="cloud-sync-item-main">
                    <div class="cloud-sync-item-title">${profile.profileName}</div>
                    <div class="cloud-sync-item-meta">${profile.examCount} 场考试 · ${formatBytes(profile.dataSize)}</div>
                    <div class="cloud-sync-item-sub">最近同步：${formatTime(profile.lastSyncAt)}</div>
                </div>
                ${getStatusBadge(status)}
            </label>
        `;
    }).join('') || '<div class="cloud-sync-empty-list">云端还没有备份数据</div>';

    body.innerHTML = `
        <div class="cloud-sync-user">当前账户：${user?.email || '未登录'}</div>
        <div class="cloud-sync-columns">
            <section class="cloud-sync-column">
                <div class="cloud-sync-column-header">
                    <div>
                        <h4>📂 本地档案</h4>
                        <p>共 ${localProfiles.length} 个档案</p>
                    </div>
                    <button type="button" class="cloud-sync-link" id="selectAllLocalBtn">全选</button>
                </div>
                <div class="cloud-sync-list">${localHtml}</div>
            </section>
            <section class="cloud-sync-column">
                <div class="cloud-sync-column-header">
                    <div>
                        <h4>☁️ 云端档案</h4>
                        <p>共 ${cloudProfiles.length} 个档案</p>
                    </div>
                    <button type="button" class="cloud-sync-link" id="selectAllCloudBtn">全选</button>
                </div>
                <div class="cloud-sync-list">${cloudHtml}</div>
            </section>
        </div>
        <div class="cloud-sync-actions">
            <button type="button" class="cloud-sync-primary" id="uploadCloudBtn" ${_loading ? 'disabled' : ''}>备份选中到云端</button>
            <button type="button" class="cloud-sync-primary alt" id="downloadCloudBtn" ${_loading ? 'disabled' : ''}>恢复选中到本地</button>
            <button type="button" class="cloud-sync-danger" id="deleteCloudBtn" ${_loading ? 'disabled' : ''}>删除云端选中</button>
        </div>
    `;

    body.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', () => {
            const targetSet = input.dataset.kind === 'local' ? _selectedLocal : _selectedCloud;
            if (input.checked) {
                targetSet.add(input.dataset.id);
            } else {
                targetSet.delete(input.dataset.id);
            }
        });
    });

    document.getElementById('selectAllLocalBtn')?.addEventListener('click', () => {
        _selectedLocal = new Set(localProfiles.map(item => item.profileId));
        renderLists(user, localProfiles, cloudProfiles);
    });

    document.getElementById('selectAllCloudBtn')?.addEventListener('click', () => {
        _selectedCloud = new Set(cloudProfiles.map(item => item.profileId));
        renderLists(user, localProfiles, cloudProfiles);
    });

    document.getElementById('uploadCloudBtn')?.addEventListener('click', async () => {
        if (!_selectedLocal.size) {
            setStatus('请先选择要备份的本地档案', 'warning');
            return;
        }
        await handleUpload(Array.from(_selectedLocal));
    });

    document.getElementById('downloadCloudBtn')?.addEventListener('click', async () => {
        if (!_selectedCloud.size) {
            setStatus('请先选择要恢复的云端档案', 'warning');
            return;
        }
        await handleDownload(Array.from(_selectedCloud));
    });

    document.getElementById('deleteCloudBtn')?.addEventListener('click', async () => {
        if (!_selectedCloud.size) {
            setStatus('请先选择要删除的云端档案', 'warning');
            return;
        }
        await handleDelete(Array.from(_selectedCloud));
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

    setStatus('正在读取云端档案…', 'pending');
    try {
        const localProfiles = getLocalProfileSummaries();
        _latestCloudProfiles = await getCloudProfiles();
        setStatus(_latestCloudProfiles.length ? '已读取云端档案，可执行备份或恢复。' : '云端还没有备份数据，可以先从本地备份。', _latestCloudProfiles.length ? 'success' : 'info');
        renderLists(user, localProfiles, _latestCloudProfiles);
    } catch (error) {
        setStatus(error.message || '云端同步面板加载失败', 'error');
        document.getElementById('cloudSyncBody').innerHTML = '<div class="cloud-sync-empty"><div class="cloud-sync-empty-icon">⚠️</div><div class="cloud-sync-empty-title">云端同步暂时不可用</div><div class="cloud-sync-empty-desc">请检查 cloud_profiles 集合、云函数权限或网络配置后重试。</div></div>';
    }
}

async function handleUpload(profileIds) {
    _loading = true;
    setStatus('正在备份到云端…', 'pending');
    try {
        for (const profileId of profileIds) {
            await uploadProfile(profileId);
        }
        _selectedLocal.clear();
        await renderCloudSyncContent();
        if (_refreshAll) await _refreshAll();
        showToast({ icon: '☁️', title: '备份完成', message: `已成功备份 ${profileIds.length} 个档案到云端。` });
    } catch (error) {
        setStatus(error.message || '备份失败', 'error');
    } finally {
        _loading = false;
    }
}

async function handleDownload(profileIds) {
    _loading = true;
    setStatus('正在从云端恢复…', 'pending');
    try {
        const restored = await downloadProfiles(profileIds);
        _selectedCloud.clear();
        if (_refreshAll) await _refreshAll();
        await renderCloudSyncContent();
        showToast({ icon: '📥', title: '恢复完成', message: `已恢复 ${restored.length} 个云端档案到本地。` });
    } catch (error) {
        setStatus(error.message || '恢复失败', 'error');
    } finally {
        _loading = false;
    }
}

async function handleDelete(profileIds) {
    const names = _latestCloudProfiles.filter(item => profileIds.includes(item.profileId)).map(item => item.profileName).join('、');
    showConfirmDialog({
        icon: '☁️',
        iconType: 'danger',
        title: '删除云端档案？',
        message: `确定要删除云端中的 ${profileIds.length} 个档案吗？\n\n${names}`,
        okText: '删除云端数据',
        okClass: 'confirm-ok-btn',
        onConfirm: async () => {
            _loading = true;
            setStatus('正在删除云端数据…', 'pending');
            try {
                const count = await deleteCloudProfiles(profileIds);
                _selectedCloud.clear();
                await renderCloudSyncContent();
                showToast({ icon: '🗑️', title: '删除完成', message: `已删除 ${count} 个云端档案，本地数据不受影响。` });
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


