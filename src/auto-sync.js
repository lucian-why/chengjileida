import { getCurrentUser, isAuthEnabled, isAdminUser } from './auth.js';
import { getCloudProfiles, uploadProfile, deleteCloudProfiles, downloadProfiles, getLocalProfileSummaries } from './cloud-sync.js';
import { setStorageSyncHooks } from './storage.js';

const AUTO_SYNC_DELAY = 2000;

let initialized = false;
let refreshAllHandler = null;
let syncStatusHandler = null;
let debounceTimer = null;
let suppressDepth = 0;
let syncing = false;
let pendingRun = false;
let deletedProfileIds = new Set();
let lastLocalSnapshot = '';

function setSyncStatus(message = '', type = '', visible = true) {
    if (typeof syncStatusHandler === 'function') {
        syncStatusHandler({ message, type, visible });
    }
}

function isSuppressed() {
    return suppressDepth > 0;
}

async function runSuppressed(task) {
    suppressDepth += 1;
    try {
        return await task();
    } finally {
        suppressDepth = Math.max(0, suppressDepth - 1);
    }
}

function getLocalSnapshotKey() {
    const localProfiles = getLocalProfileSummaries();
    return JSON.stringify(localProfiles.map((item) => [
        item.profileId,
        item.profileName,
        item.examCount,
        item.dataSize
    ]));
}

function clearDebounce() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
}

function canAutoSync(user) {
    return Boolean(user && !isAdminUser(user));
}

async function performFullSync(reason = 'manual') {
    if (syncing) {
        pendingRun = true;
        return;
    }

    const user = await getCurrentUser();
    if (!canAutoSync(user) || !isAuthEnabled()) {
        clearDebounce();
        setSyncStatus('', '', false);
        return;
    }

    syncing = true;
    clearDebounce();
    setSyncStatus(reason === 'login' ? '正在同步云端档案…' : '正在同步最新变更…', 'pending', true);

    try {
        if (deletedProfileIds.size) {
            await deleteCloudProfiles(Array.from(deletedProfileIds));
        }

        const cloudProfiles = await getCloudProfiles();
        const cloudIds = cloudProfiles
            .map((item) => item.profileId)
            .filter((id) => id && !deletedProfileIds.has(id));

        if (cloudIds.length) {
            await runSuppressed(async () => {
                await downloadProfiles(cloudIds);
            });
            if (typeof refreshAllHandler === 'function') {
                await refreshAllHandler();
            }
        }

        const localProfiles = getLocalProfileSummaries();
        for (const profile of localProfiles) {
            await uploadProfile(profile.profileId);
        }

        deletedProfileIds.clear();
        lastLocalSnapshot = getLocalSnapshotKey();
        setSyncStatus('已自动同步到云端', 'success', true);
        setTimeout(() => {
            if (!syncing) {
                setSyncStatus('已开启自动云同步', 'info', true);
            }
        }, 1600);
    } catch (error) {
        setSyncStatus(error.message || '自动同步失败', 'error', true);
    } finally {
        syncing = false;
        if (pendingRun) {
            pendingRun = false;
            await performFullSync('queued');
        }
    }
}

function scheduleAutoSync(change = {}) {
    if (isSuppressed()) return;

    getCurrentUser().then((user) => {
        if (!canAutoSync(user) || !isAuthEnabled()) return;

        if (change.type === 'profile-delete' && change.profileId) {
            deletedProfileIds.add(change.profileId);
            setSyncStatus('正在将删除操作同步到云端…', 'pending', true);
            clearDebounce();
            performFullSync('profile-delete');
            return;
        }

        const snapshot = getLocalSnapshotKey();
        if (snapshot === lastLocalSnapshot && deletedProfileIds.size === 0) {
            return;
        }

        setSyncStatus('检测到本地改动，稍后自动同步…', 'info', true);
        clearDebounce();
        debounceTimer = setTimeout(() => {
            performFullSync('local-change');
        }, AUTO_SYNC_DELAY);
    }).catch(() => {});
}

export function initAutoSync({ refreshAll, onStatusChange } = {}) {
    refreshAllHandler = refreshAllHandler || refreshAll || null;
    syncStatusHandler = onStatusChange || null;

    if (initialized) return;

    setStorageSyncHooks({
        onChange: scheduleAutoSync,
        isSuppressed
    });

    window.addEventListener('focus', () => {
        performFullSync('focus');
    });

    initialized = true;
}

export async function syncAfterLogin() {
    await performFullSync('login');
}

export function handleLogoutAutoSync() {
    deletedProfileIds.clear();
    pendingRun = false;
    syncing = false;
    lastLocalSnapshot = '';
    clearDebounce();
    setSyncStatus('', '', false);
}

export function getAutoSyncStatusText() {
    return '已开启自动云同步';
}
