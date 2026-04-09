import { getCurrentUser, isAuthEnabled } from './auth.js';
import { callFunction } from './cloud-tcb.js';
import { getAllLocalProfileBundles, getLocalProfileBundle, applyCloudProfileBundle, getProfiles } from './storage.js';

async function ensureCloudReady() {
    if (!isAuthEnabled()) {
        throw new Error('当前环境未启用腾讯云登录');
    }

    const user = await getCurrentUser();
    if (!user) {
        throw new Error('请先登录后再使用云端同步');
    }

    return user;
}

function normalizeFunctionResult(result, fallback) {
    const payload = result?.result ?? result;
    if (!payload) {
        throw new Error(fallback);
    }

    if (typeof payload.code === 'number' && payload.code !== 0) {
        throw new Error(payload.message || fallback);
    }

    return payload.data ?? payload;
}

function formatTCBError(error, fallback) {
    const message = error?.message || fallback;
    if (/function.*not found|resource not found|未找到函数|Cannot find module/i.test(message)) {
        return '腾讯云同步云函数尚未部署，请先创建 listCloudProfiles、getCloudProfileData、uploadCloudProfile、deleteCloudProfiles。';
    }
    if (/cloud_profiles/i.test(message)) {
        return '腾讯云 cloud_profiles 集合尚未创建，请先在云开发文档型数据库中创建该集合。';
    }
    if (/未登录|获取当前登录用户失败/i.test(message)) {
        return '当前尚未完成云端登录，请重新登录后再试。';
    }
    if (/登录已过期|PERMISSION_DENIED/i.test(message)) {
        return '当前云端同步请求被拒绝，请检查登录方式、集合权限或云函数权限后重试。';
    }
    return message;
}

function estimateBundleSize(bundle) {
    return new TextEncoder().encode(JSON.stringify(bundle)).length;
}

function toCloudSummary(row = {}) {
    return {
        id: row.id || row._id || row.profile_id,
        profileId: row.profileId || row.profile_id,
        profileName: row.profileName || row.profile_name,
        examCount: row.examCount || row.exam_count || 0,
        dataSize: row.dataSize || row.data_size || 0,
        lastSyncAt: row.lastSyncAt || row.last_sync_at || row.updated_at || row.created_at || null,
        bundle: row.bundle || row.profileData || row.profile_data || null,
        deleted: row.deleted || false,
        deletedAt: row.deletedAt || row.deleted_at || null
    };
}

async function callSyncFunction(name, data, fallback) {
    try {
        const result = await callFunction(name, data);
        return normalizeFunctionResult(result, fallback);
    } catch (error) {
        throw new Error(formatTCBError(error, fallback));
    }
}

export async function getCloudProfiles() {
    const user = await ensureCloudReady();
    const data = await callSyncFunction('listCloudProfiles', {
        userId: user.id || '',
        userEmail: user.email || ''
    }, '获取云端档案失败');
    const rows = Array.isArray(data) ? data : (data?.profiles || data?.list || []);
    return rows.map(toCloudSummary);
}

export async function getCloudProfileData(profileId) {
    const user = await ensureCloudReady();
    const data = await callSyncFunction('getCloudProfileData', {
        profileId,
        userId: user.id || '',
        userEmail: user.email || ''
    }, '获取云端档案详情失败');
    if (!data) return null;
    return toCloudSummary(data);
}

export async function uploadProfile(profileId) {
    const user = await ensureCloudReady();

    // 禁止示例档案上传云端（静默跳过）
    const profiles = getProfiles();
    const profileMeta = profiles.find(p => p.id === profileId);
    if (profileMeta?.isDemo) {
        return { profileId, profileName: profileMeta.name, examCount: 0, lastSyncAt: new Date().toISOString() };
    }

    const localBundle = getLocalProfileBundle(profileId);
    if (!localBundle) {
        throw new Error('未找到要备份的本地档案');
    }

    const payload = {
        profileId: localBundle.profileId,
        profileName: localBundle.profileName,
        profileData: localBundle.bundle,
        examCount: localBundle.examCount,
        dataSize: estimateBundleSize(localBundle.bundle),
        userId: user.id || '',
        userEmail: user.email || ''
    };

    const data = await callSyncFunction('uploadCloudProfile', payload, '上传云端档案失败');
    return {
        profileId: localBundle.profileId,
        profileName: localBundle.profileName,
        examCount: localBundle.examCount,
        lastSyncAt: data?.lastSyncAt || data?.last_sync_at || new Date().toISOString()
    };
}

export async function downloadProfiles(profileIds = []) {
    const cloudProfiles = await Promise.all(profileIds.map((profileId) => getCloudProfileData(profileId)));
    const validProfiles = cloudProfiles.filter(Boolean);

    validProfiles.forEach((profile) => {
        const bundle = profile.bundle || profile.profileData || profile.profile_data || profile;
        // 跳过云端的示例档案（根据名字判断）
        const profileName = bundle?.profile?.name || profile.profileName || '';
        if (profileName === '人生档案' && isDemoLikeBundle(bundle)) {
            return;
        }
        applyCloudProfileBundle(bundle);
    });

    return validProfiles;
}

/**
 * 判断一个 bundle 是否像示例档案（只有 demo 开头的考试 ID）
 */
function isDemoLikeBundle(bundle) {
    const exams = bundle?.exams || [];
    if (exams.length === 0) return true;
    const demoExamCount = exams.filter(exam => String(exam.id || '').startsWith('demo_')).length;
    return demoExamCount === exams.length;
}

export async function deleteCloudProfiles(profileIds = []) {
    if (!profileIds.length) return 0;
    const user = await ensureCloudReady();
    const data = await callSyncFunction('deleteCloudProfiles', {
        profileIds,
        userId: user.id || '',
        userEmail: user.email || ''
    }, '删除云端档案失败');
    return data?.count || data?.deletedCount || profileIds.length;
}

export async function listDeletedProfiles() {
    const user = await ensureCloudReady();
    const data = await callSyncFunction('listCloudProfiles', {
        userId: user.id || '',
        userEmail: user.email || '',
        showDeleted: true
    }, '获取已删除档案失败');
    const rows = Array.isArray(data) ? data : (data?.profiles || data?.list || []);
    return rows.filter(r => r.deleted).map(toCloudSummary);
}

export async function restoreCloudProfiles(profileIds = []) {
    if (!profileIds.length) return 0;
    const user = await ensureCloudReady();
    const data = await callSyncFunction('restoreCloudProfiles', {
        profileIds,
        userId: user.id || '',
        userEmail: user.email || ''
    }, '恢复云端档案失败');
    return data?.count || profileIds.length;
}

export async function purgeDeletedProfiles(profileIds = []) {
    if (!profileIds.length) return 0;
    const user = await ensureCloudReady();
    const data = await callSyncFunction('purgeDeletedProfiles', {
        profileIds,
        userId: user.id || '',
        userEmail: user.email || ''
    }, '彻底删除云端档案失败');
    return data?.count || data?.purgedCount || profileIds.length;
}

export function compareProfiles(localProfiles = getAllLocalProfileBundles(), cloudProfiles = []) {
    // 过滤掉本地示例档案
    const profiles = getProfiles();
    const demoIds = new Set(profiles.filter(p => p.isDemo).map(p => p.id));
    const filteredLocal = localProfiles.filter(local => !demoIds.has(local.profileId));

    const cloudMap = new Map(cloudProfiles.map((item) => [item.profileId, item]));

    return filteredLocal.map((local) => {
        const cloud = cloudMap.get(local.profileId);
        let status = 'local-only';
        if (cloud) {
            status = cloud.examCount === local.examCount && cloud.dataSize === local.dataSize ? 'synced' : 'different';
        }

        return {
            profileId: local.profileId,
            profileName: local.profileName,
            localExamCount: local.examCount,
            localDataSize: local.dataSize,
            cloudExamCount: cloud?.examCount || 0,
            cloudDataSize: cloud?.dataSize || 0,
            cloudLastSyncAt: cloud?.lastSyncAt || null,
            status
        };
    });
}

export function getLocalProfileSummaries() {
    return getAllLocalProfileBundles().map((bundle) => ({
        profileId: bundle.profileId,
        profileName: bundle.profileName,
        examCount: bundle.examCount,
        dataSize: bundle.dataSize
    }));
}


