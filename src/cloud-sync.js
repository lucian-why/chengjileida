import { getCurrentUser, isAuthEnabled } from './auth.js';
import { callFunction } from './cloud-tcb.js';
import { getAllLocalProfileBundles, getLocalProfileBundle, applyCloudProfileBundle } from './storage.js';

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
        bundle: row.bundle || row.profileData || row.profile_data || null
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
    await ensureCloudReady();
    const data = await callSyncFunction('listCloudProfiles', {}, '获取云端档案失败');
    const rows = Array.isArray(data) ? data : (data?.profiles || data?.list || []);
    return rows.map(toCloudSummary);
}

export async function getCloudProfileData(profileId) {
    await ensureCloudReady();
    const data = await callSyncFunction('getCloudProfileData', { profileId }, '获取云端档案详情失败');
    if (!data) return null;
    return toCloudSummary(data);
}

export async function uploadProfile(profileId) {
    const user = await ensureCloudReady();
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
        applyCloudProfileBundle(profile.bundle || profile.profileData || profile.profile_data || profile);
    });

    return validProfiles;
}

export async function deleteCloudProfiles(profileIds = []) {
    if (!profileIds.length) return 0;
    await ensureCloudReady();
    const data = await callSyncFunction('deleteCloudProfiles', { profileIds }, '删除云端档案失败');
    return data?.count || data?.deletedCount || profileIds.length;
}

export function compareProfiles(localProfiles = getAllLocalProfileBundles(), cloudProfiles = []) {
    const cloudMap = new Map(cloudProfiles.map((item) => [item.profileId, item]));

    return localProfiles.map((local) => {
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


