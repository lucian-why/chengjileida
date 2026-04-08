import state from './store.js';
import { getTCBServiceBase } from './cloud-tcb.js';
import { showConfirmDialog, showToast } from './modal.js';
import { getAdminAccessToken } from './auth.js';

export const ENCOURAGEMENT_SCENES = {
    EXAM_DETAIL_COLLAPSED_EMPTY: 'exam_detail.collapsed_empty'
};

const STORAGE_KEY = 'encouragement_copy_cache_v1';

const SCENE_OPTIONS = [
    {
        key: ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY,
        label: '考试详情空状态（收起考试后）'
    }
];

const LOCAL_FALLBACK_COPIES = {
    [ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY]: [
        { id: 'local-collapsed-1', sceneKey: ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY, title: '先歇一会儿也没关系。', subtitle: '你愿意回来继续看时，这里还会安安静静等你。' },
        { id: 'local-collapsed-2', sceneKey: ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY, title: '不是每一次打开，都一定要立刻面对分数。', subtitle: '给自己一点缓冲，也是在认真照顾自己。' },
        { id: 'local-collapsed-3', sceneKey: ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY, title: '这页空下来以后，心也可以慢一点。', subtitle: '成绩会留下痕迹，但你不只是一串数字。' },
        { id: 'local-collapsed-4', sceneKey: ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY, title: '今天先看到这里，也是一种节奏。', subtitle: '慢慢来，比勉强自己更重要。' },
        { id: 'local-collapsed-5', sceneKey: ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY, title: '愿你看成绩的时候，也别忘了看见自己。', subtitle: '努力、疲惫、失常和回升，都是成长的一部分。' },
        { id: 'local-collapsed-6', sceneKey: ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY, title: '把这一场先轻轻放下吧。', subtitle: '等你准备好了，再回来和它坐一会儿。' }
    ]
};

let managerBound = false;
let managerSceneKey = ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY;
let managerCopies = [];
const ENCOURAGEMENT_HTTP_BASE = getTCBServiceBase();

function isBrowser() {
    return typeof window !== 'undefined';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function loadCacheState() {
    if (!isBrowser()) return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        state.encouragementCopyCache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        state.encouragementCopyCache = {};
    }
    return state.encouragementCopyCache;
}

function saveCacheState() {
    if (!isBrowser()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.encouragementCopyCache || {}));
}

function getCache() {
    if (!state.encouragementCopyCache || typeof state.encouragementCopyCache !== 'object') {
        return loadCacheState();
    }
    return state.encouragementCopyCache;
}

function getSceneCache(sceneKey) {
    return getCache()[sceneKey] || null;
}

function setSceneCache(sceneKey, payload) {
    const nextCache = { ...getCache(), [sceneKey]: payload };
    state.encouragementCopyCache = nextCache;
    saveCacheState();
}

function updateSceneCache(sceneKey, partial) {
    const current = getSceneCache(sceneKey) || {};
    setSceneCache(sceneKey, { ...current, ...partial });
}

function pickRandomCopy(sceneKey, excludeId = '') {
    const source = LOCAL_FALLBACK_COPIES[sceneKey] || [];
    if (source.length === 0) return null;
    const filtered = source.filter(item => item.id !== excludeId);
    const pool = filtered.length > 0 ? filtered : source;
    return pool[Math.floor(Math.random() * pool.length)];
}

function normalizeCopy(raw, sceneKey) {
    if (!raw) return null;
    return {
        id: raw.id || raw.copyId || raw._id || raw.docId || '',
        sceneKey: raw.sceneKey || sceneKey,
        title: String(raw.title || '').trim(),
        subtitle: String(raw.subtitle || '').trim(),
        status: raw.status || 'active',
        sortOrder: Number(raw.sortOrder || 0),
        tags: Array.isArray(raw.tags) ? raw.tags : []
    };
}

async function fetchCopyFromCloud(sceneKey, context = {}, excludeId = '') {
    const payload = await callEncouragementHttp('getEncouragementCopy', { sceneKey, excludeId });
    if (payload?.code !== 0 || !payload?.data) {
        throw new Error(payload?.message || '读取暖心文案失败');
    }
    const copy = normalizeCopy(payload.data, sceneKey);
    if (!copy?.title || !copy?.subtitle) {
        throw new Error('暖心文案数据不完整');
    }
    return copy;
}

function rememberSceneCopy(sceneKey, copy, active = true) {
    updateSceneCache(sceneKey, {
        sceneKey,
        copyId: copy.id,
        title: copy.title,
        subtitle: copy.subtitle,
        active,
        updatedAt: Date.now()
    });
}

export function leaveEncouragementScene(sceneKey) {
    const current = getSceneCache(sceneKey);
    if (!current) return;
    updateSceneCache(sceneKey, { active: false, updatedAt: Date.now() });
}

export function getActiveEncouragementSceneKey() {
    const cache = getCache();
    return Object.keys(cache).find(sceneKey => !!cache[sceneKey]?.active) || '';
}

export function restoreActiveEncouragementScene() {
    const activeSceneKey = getActiveEncouragementSceneKey();
    if (activeSceneKey) {
        state.detailEmptySceneKey = activeSceneKey;
    }
    return activeSceneKey;
}

export function leaveAllEncouragementScenes() {
    const cache = { ...getCache() };
    let changed = false;
    Object.keys(cache).forEach(sceneKey => {
        if (cache[sceneKey]?.active) {
            cache[sceneKey] = { ...cache[sceneKey], active: false, updatedAt: Date.now() };
            changed = true;
        }
    });
    if (changed) {
        state.encouragementCopyCache = cache;
        saveCacheState();
    }
}

async function resolveSceneCopy(sceneKey, context = {}) {
    const cache = getSceneCache(sceneKey);
    if (cache?.active && cache?.copyId && cache?.title && cache?.subtitle) {
        return normalizeCopy({
            id: cache.copyId,
            sceneKey,
            title: cache.title,
            subtitle: cache.subtitle
        }, sceneKey);
    }

    const excludeId = cache?.copyId || '';

    try {
        const cloudCopy = await fetchCopyFromCloud(sceneKey, context, excludeId);
        rememberSceneCopy(sceneKey, cloudCopy, true);
        return cloudCopy;
    } catch (error) {
        console.warn('[encouragement-copy] fallback to local copy:', error?.message || error);
        const fallback = pickRandomCopy(sceneKey, excludeId) || pickRandomCopy(sceneKey);
        if (!fallback) {
            return {
                id: `local-empty-${sceneKey}`,
                sceneKey,
                title: '先停在这里，也很好。',
                subtitle: '等你想继续看的时候，我会陪你把这一页重新打开。'
            };
        }
        rememberSceneCopy(sceneKey, fallback, true);
        return fallback;
    }
}

function getCollapsedEmptyMarkup(copy) {
    return `
        <div class="encouragement-empty-state">
            <div class="encouragement-empty-badge">留白时刻</div>
            <div class="encouragement-empty-title">${escapeHtml(copy.title)}</div>
            <div class="encouragement-empty-subtitle">${escapeHtml(copy.subtitle)}</div>
        </div>
    `;
}

export async function renderCollapsedEmptyEncouragement(container, context = {}) {
    const sceneKey = ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY;
    const copy = await resolveSceneCopy(sceneKey, context);

    if (!container) return;
    if (state.currentExamId || state.detailEmptySceneKey !== sceneKey) return;

    container.innerHTML = getCollapsedEmptyMarkup(copy);
}

function setManagerStatus(message = '', type = 'info') {
    const el = document.getElementById('encouragementManagerStatus');
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
}

function getSelectedSceneKey() {
    const select = document.getElementById('encouragementSceneSelect');
    return select?.value || ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY;
}

function openEditorModal() {
    const modal = document.getElementById('encouragementEditorModal');
    modal?.classList.add('active');
}

function closeEditorModal() {
    const modal = document.getElementById('encouragementEditorModal');
    modal?.classList.remove('active');
}

function renderManagerList() {
    const list = document.getElementById('encouragementCopyList');
    if (!list) return;

    if (!managerCopies.length) {
        list.innerHTML = `
            <div class="encouragement-manager-empty">
                <div class="encouragement-manager-empty-title">这个场景还没有云端文案</div>
                <div class="encouragement-manager-empty-desc">你可以手动新增，或者先导入一组默认文案作为起点。</div>
            </div>
        `;
        return;
    }

    list.innerHTML = managerCopies.map(copy => `
        <div class="encouragement-copy-item">
            <div class="encouragement-copy-main">
                <div class="encouragement-copy-title-row">
                    <div class="encouragement-copy-title">${escapeHtml(copy.title)}</div>
                    <span class="encouragement-copy-status ${copy.status === 'active' ? 'active' : 'inactive'}">${copy.status === 'active' ? '启用中' : '已停用'}</span>
                </div>
                <div class="encouragement-copy-subtitle compact">${escapeHtml(copy.subtitle)}</div>
                <div class="encouragement-copy-meta">
                    <span>场景：${escapeHtml(copy.sceneKey)}</span>
                    <span>排序：${Number(copy.sortOrder || 0)}</span>
                </div>
            </div>
            <div class="encouragement-copy-actions">
                <button type="button" class="btn-small" data-role="edit-copy" data-copy-id="${escapeHtml(copy.id)}">编辑</button>
                <button type="button" class="btn-small" data-role="toggle-copy" data-copy-id="${escapeHtml(copy.id)}" data-next-status="${copy.status === 'active' ? 'inactive' : 'active'}">${copy.status === 'active' ? '停用' : '启用'}</button>
                <button type="button" class="btn-small danger" data-role="delete-copy" data-copy-id="${escapeHtml(copy.id)}">删除</button>
            </div>
        </div>
    `).join('');
}

function resetManagerForm() {
    const form = document.getElementById('encouragementCopyForm');
    if (!form) return;
    form.reset();
    document.getElementById('encouragementCopyId').value = '';
    document.getElementById('encouragementCopySceneKey').value = getSelectedSceneKey();
    document.getElementById('encouragementCopyStatus').value = 'active';
    document.getElementById('encouragementCopySortOrder').value = '10';
    document.getElementById('encouragementFormTitle').textContent = '新增文案';
}

function fillManagerForm(copy) {
    document.getElementById('encouragementCopyId').value = copy.id || '';
    document.getElementById('encouragementCopySceneKey').value = copy.sceneKey || getSelectedSceneKey();
    document.getElementById('encouragementCopyTitle').value = copy.title || '';
    document.getElementById('encouragementCopySubtitle').value = copy.subtitle || '';
    document.getElementById('encouragementCopyStatus').value = copy.status || 'active';
    document.getElementById('encouragementCopySortOrder').value = String(Number(copy.sortOrder || 0));
    document.getElementById('encouragementFormTitle').textContent = '编辑文案';
}

async function callManageCopies(action, extra = {}) {
    const payload = await callEncouragementHttp('manageEncouragementCopies', {
        action,
        adminAccessToken: getAdminAccessToken(),
        ...extra
    });
    if (payload?.code !== 0) {
        throw new Error(payload?.message || '文案库操作失败');
    }
    return payload.data;
}

async function callEncouragementHttp(name, params = {}) {
    if (!isBrowser() || typeof fetch !== 'function') {
        throw new Error('当前环境不支持暖心文案接口调用');
    }

    const endpoint = new URL(`${ENCOURAGEMENT_HTTP_BASE}/${name}`);
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        endpoint.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });

    const response = await fetch(endpoint.toString(), { method: 'GET' });
    const text = await response.text();

    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        throw new Error(text || '暖心文案接口返回了无法解析的内容');
    }

    if (!response.ok && !payload) {
        throw new Error(`HTTP ${response.status}`);
    }

    return payload;
}

async function loadManagerCopies(sceneKey = getSelectedSceneKey()) {
    managerSceneKey = sceneKey;
    setManagerStatus('正在读取云端文案库...', 'pending');
    try {
        const data = await callManageCopies('list', { sceneKey });
        managerCopies = Array.isArray(data?.copies) ? data.copies.map(item => normalizeCopy(item, sceneKey)) : [];
        renderManagerList();
        resetManagerForm();
        setManagerStatus(`已加载 ${managerCopies.length} 条文案`, 'success');
    } catch (error) {
        managerCopies = [];
        renderManagerList();
        setManagerStatus(error.message || '读取文案失败', 'error');
    }
}

async function handleManagerSave(event) {
    event.preventDefault();

    const payload = {
        id: document.getElementById('encouragementCopyId').value.trim(),
        sceneKey: document.getElementById('encouragementCopySceneKey').value.trim(),
        title: document.getElementById('encouragementCopyTitle').value.trim(),
        subtitle: document.getElementById('encouragementCopySubtitle').value.trim(),
        status: document.getElementById('encouragementCopyStatus').value,
        sortOrder: Number(document.getElementById('encouragementCopySortOrder').value || 0)
    };

    if (!payload.title || !payload.subtitle) {
        showToast({ icon: '⚠️', iconType: 'warning', title: '内容不完整', message: '主句和副句都需要填写。' });
        return;
    }

    setManagerStatus(payload.id ? '正在保存修改...' : '正在创建文案...', 'pending');

    try {
        await callManageCopies('save', { copy: payload });
        await loadManagerCopies(payload.sceneKey);
        closeEditorModal();
        showToast({
            icon: '✅',
            iconType: 'success',
            title: payload.id ? '已更新' : '已新增',
            message: payload.id ? '文案已经保存到云端。' : '新的暖心文案已经加入文案库。'
        });
    } catch (error) {
        setManagerStatus(error.message || '保存失败', 'error');
    }
}

async function handleSeedDefaults() {
    const sceneKey = getSelectedSceneKey();
    setManagerStatus('正在导入默认文案...', 'pending');
    try {
        const data = await callManageCopies('seedDefaults', { sceneKey });
        await loadManagerCopies(sceneKey);
        showToast({
            icon: '🌿',
            iconType: 'success',
            title: '已导入默认文案',
            message: `这次补进了 ${Number(data?.insertedCount || 0)} 条默认文案。`
        });
    } catch (error) {
        setManagerStatus(error.message || '导入失败', 'error');
    }
}

async function handleListActions(event) {
    const button = event.target.closest('button[data-role]');
    if (!button) return;

    const copyId = button.dataset.copyId;
    const role = button.dataset.role;
    const targetCopy = managerCopies.find(item => String(item.id) === String(copyId));
    if (!targetCopy) return;

    if (role === 'edit-copy') {
        fillManagerForm(targetCopy);
        document.getElementById('encouragementCopyTitle')?.focus();
        openEditorModal();
        return;
    }

    if (role === 'toggle-copy') {
        try {
            setManagerStatus('正在更新文案状态...', 'pending');
            await callManageCopies('toggleStatus', {
                id: copyId,
                status: button.dataset.nextStatus || 'inactive'
            });
            await loadManagerCopies(managerSceneKey);
        } catch (error) {
            setManagerStatus(error.message || '更新状态失败', 'error');
        }
        return;
    }

    if (role === 'delete-copy') {
        showConfirmDialog({
            icon: '🗑️',
            iconType: 'danger',
            title: '删除这条文案？',
            message: '删除后将无法恢复，这条文案也不会再被随机展示。',
            okText: '删除',
            okClass: 'confirm-ok-btn',
            onConfirm: async () => {
                try {
                    setManagerStatus('正在删除文案...', 'pending');
                    await callManageCopies('remove', { id: copyId });
                    await loadManagerCopies(managerSceneKey);
                    showToast({ icon: '✅', iconType: 'success', title: '已删除', message: '文案已经从云端文案库移除。' });
                } catch (error) {
                    setManagerStatus(error.message || '删除失败', 'error');
                }
            }
        });
    }
}

export function setupEncouragementManager() {
    loadCacheState();
    restoreActiveEncouragementScene();

    if (managerBound) return;

    const sceneSelect = document.getElementById('encouragementSceneSelect');
    const form = document.getElementById('encouragementCopyForm');
    const refreshBtn = document.getElementById('encouragementManagerRefresh');
    const createBtn = document.getElementById('encouragementManagerCreate');
    const seedBtn = document.getElementById('encouragementManagerSeed');
    const cancelBtn = document.getElementById('encouragementCopyCancel');
    const closeBtn = document.getElementById('encouragementEditorClose');
    const modal = document.getElementById('encouragementEditorModal');
    const list = document.getElementById('encouragementCopyList');

    if (!sceneSelect || !form || !refreshBtn || !createBtn || !seedBtn || !cancelBtn || !closeBtn || !modal || !list) return;

    sceneSelect.innerHTML = SCENE_OPTIONS.map(option => `
        <option value="${escapeHtml(option.key)}">${escapeHtml(option.label)}</option>
    `).join('');
    sceneSelect.value = managerSceneKey;
    document.getElementById('encouragementCopySceneKey').value = managerSceneKey;

    sceneSelect.addEventListener('change', async () => {
        document.getElementById('encouragementCopySceneKey').value = sceneSelect.value;
        await loadManagerCopies(sceneSelect.value);
    });
    refreshBtn.addEventListener('click', () => loadManagerCopies(getSelectedSceneKey()));
    createBtn.addEventListener('click', () => {
        resetManagerForm();
        openEditorModal();
        document.getElementById('encouragementCopyTitle')?.focus();
    });
    seedBtn.addEventListener('click', handleSeedDefaults);
    form.addEventListener('submit', handleManagerSave);
    cancelBtn.addEventListener('click', () => {
        resetManagerForm();
        closeEditorModal();
    });
    closeBtn.addEventListener('click', closeEditorModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeEditorModal();
    });
    list.addEventListener('click', handleListActions);

    managerBound = true;
    resetManagerForm();
    loadManagerCopies(managerSceneKey);
}

export function resetEncouragementManager() {
    managerBound = false;
    managerSceneKey = ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY;
    managerCopies = [];
}

export function mountEncouragementAdminPage() {
    resetEncouragementManager();
    setupEncouragementManager();
}
