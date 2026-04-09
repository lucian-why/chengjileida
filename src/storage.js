/**
 * storage.js - 数据存储层
 */

const EXAMS_KEY = 'xueji_exams';
const PROFILES_KEY = 'xueji_profiles';
const ACTIVE_PROFILE_KEY = 'xueji_active_profile';
const FORM_MEMORY_KEY = 'xueji_form_memory';
let storageChangeHandler = null;
let storageChangeSuppressed = null;

function notifyStorageChanged(change = {}) {
    const suppressed = typeof storageChangeSuppressed === 'function' ? storageChangeSuppressed() : false;
    if (suppressed) return;
    if (typeof storageChangeHandler === 'function') {
        storageChangeHandler(change);
    }
}

export function setStorageSyncHooks({ onChange = null, isSuppressed = null } = {}) {
    storageChangeHandler = typeof onChange === 'function' ? onChange : null;
    storageChangeSuppressed = typeof isSuppressed === 'function' ? isSuppressed : null;
}

function persistProfiles(profiles, options = {}) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    if (!options.silent) {
        notifyStorageChanged({ type: 'profiles', profileIds: Array.isArray(profiles) ? profiles.map((item) => item.id).filter(Boolean) : [] });
    }
}

function persistExams(exams, options = {}) {
    localStorage.setItem(EXAMS_KEY, JSON.stringify(exams));
    if (!options.silent) {
        notifyStorageChanged({ type: 'exams' });
    }
}

function persistFormMemory(memory, options = {}) {
    localStorage.setItem(FORM_MEMORY_KEY, JSON.stringify(memory));
    if (!options.silent) {
        notifyStorageChanged({ type: 'form-memory' });
    }
}

function normalizeProfiles(rawProfiles = []) {
    let changed = false;
    const normalized = (Array.isArray(rawProfiles) ? rawProfiles : []).map((profile, index) => {
        const source = profile && typeof profile === 'object' ? profile : {};
        let id = source.id || source.profileId || source.profile_id || '';
        if (!id) {
            id = `profile_legacy_${Date.now()}_${index}`;
            changed = true;
        }

        const name = source.name || source.profileName || source.profile_name || `档案 ${index + 1}`;
        const createdAt = source.createdAt || source.created_at || new Date().toISOString();

        if (source.id !== id || source.name !== name || source.createdAt !== createdAt || source.profileId || source.profile_id || source.profileName || source.profile_name || source.created_at) {
            changed = true;
        }

        const isDemo = source.isDemo === true;

        if (source.id !== id || source.name !== name || source.createdAt !== createdAt || source.isDemo !== isDemo || source.profileId || source.profile_id || source.profileName || source.profile_name || source.created_at) {
            changed = true;
        }

        const result = { id, name, createdAt };
        if (isDemo) result.isDemo = true;
        return result;
    });

    return { normalized, changed };
}

function getProfiles() {
    const data = localStorage.getItem(PROFILES_KEY);
    const parsed = data ? JSON.parse(data) : [];
    const { normalized, changed } = normalizeProfiles(parsed);
    if (changed) {
        localStorage.setItem(PROFILES_KEY, JSON.stringify(normalized));
    }
    return normalized;
}

function saveProfiles(profiles) {
    persistProfiles(profiles);
}

function getActiveProfileId() {
    const saved = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (saved) return saved;

    const profiles = getProfiles();
    return profiles[0] ? profiles[0].id : '';
}

function setActiveProfileId(id) {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
}

function createProfile(name, options = {}) {
    const profiles = getProfiles();
    const id = 'profile_' + Date.now();
    const profile = { id, name, createdAt: new Date().toISOString() };
    if (options.isDemo) profile.isDemo = true;
    profiles.push(profile);
    saveProfiles(profiles);
    return id;
}

function updateProfile(id, name) {
    const profiles = getProfiles();
    const profile = profiles.find(item => item.id === id);
    if (profile) {
        profile.name = name;
        saveProfiles(profiles);
    }
}

function deleteProfile(id) {
    let profiles = getProfiles();
    profiles = profiles.filter(profile => profile.id !== id);
    persistProfiles(profiles, { silent: true });

    const exams = getExamsAll().filter(exam => exam.profileId !== id);
    persistExams(exams, { silent: true });

    const memory = getFormMemoryAll();
    if (memory[id]) {
        delete memory[id];
        persistFormMemory(memory, { silent: true });
    }

    if (getActiveProfileId() === id && profiles.length > 0) {
        setActiveProfileId(profiles[0].id);
    }

    notifyStorageChanged({ type: 'profile-delete', profileId: id });
}

function migrateProfilesIfNeeded() {
    const profiles = getProfiles();
    if (profiles.length > 0) {
        if (!localStorage.getItem(ACTIVE_PROFILE_KEY) && profiles[0]) {
            setActiveProfileId(profiles[0].id);
        }
        // 清理重复的 demo 档案：只保留第一个 isDemo 的
        deduplicateDemoProfiles(profiles);
        return;
    }

    const exams = getExamsAll();
    const defaultId = createProfile('人生档案', { isDemo: true });
    setActiveProfileId(defaultId);

    if (exams.length === 0) return;

    exams.forEach(exam => {
        exam.profileId = defaultId;
    });
    saveExams(exams);
}

/**
 * 去重 demo 档案：只保留第一个 isDemo 档案，多余的删除
 * 同时处理历史遗留的无 isDemo 标记但名称为"人生档案"且只含 demo 考试的档案
 */
function deduplicateDemoProfiles(profiles) {
    const allExams = getExamsAll();
    let changed = false;
    const toDelete = [];

    // 标记历史遗留的 demo 档案（名字为"人生档案"且只有 demo_ 开头的考试）
    profiles.forEach(profile => {
        if (profile.isDemo) return;
        if (profile.name !== '人生档案') return;
        const profileExams = allExams.filter(exam => exam.profileId === profile.id);
        if (profileExams.length === 0) {
            // 空的人生档案，标记为 demo
            profile.isDemo = true;
            changed = true;
            return;
        }
        const allDemo = profileExams.every(exam => String(exam.id || '').startsWith('demo_'));
        if (allDemo) {
            profile.isDemo = true;
            changed = true;
        }
    });

    // 去重：只保留第一个 isDemo 档案
    let firstDemoFound = false;
    profiles.forEach(profile => {
        if (!profile.isDemo) return;
        if (!firstDemoFound) {
            firstDemoFound = true;
            return;
        }
        toDelete.push(profile.id);
    });

    if (toDelete.length > 0) {
        const remaining = profiles.filter(p => !toDelete.includes(p.id));
        persistProfiles(remaining, { silent: true });

        // 清理被删除档案的考试数据
        const remainingExams = allExams.filter(exam => !toDelete.includes(exam.profileId));
        persistExams(remainingExams, { silent: true });

        // 清理 form memory
        const memory = getFormMemoryAll();
        toDelete.forEach(id => delete memory[id]);
        persistFormMemory(memory, { silent: true });

        // 如果当前活跃档案被删了，切换到第一个
        const activeId = getActiveProfileId();
        if (toDelete.includes(activeId) && remaining.length > 0) {
            setActiveProfileId(remaining[0].id);
        }
        changed = true;
    }

    if (changed && !toDelete.length) {
        persistProfiles(profiles, { silent: true });
    }
}

function getExams(profileId, excludeHidden = false) {
    const data = localStorage.getItem(EXAMS_KEY);
    let exams = data ? JSON.parse(data) : [];
    if (profileId) exams = exams.filter(exam => exam.profileId === profileId);
    if (excludeHidden) exams = exams.filter(exam => !exam.excluded);
    return exams;
}

function getExamsAll() {
    const data = localStorage.getItem(EXAMS_KEY);
    return data ? JSON.parse(data) : [];
}

function saveExams(exams) {
    persistExams(exams);
}

function getFormMemoryAll() {
    const data = localStorage.getItem(FORM_MEMORY_KEY);
    return data ? JSON.parse(data) : {};
}

function saveFormMemoryAll(memory) {
    persistFormMemory(memory);
}

function getProfileMemory(profileId) {
    const memory = getFormMemoryAll();
    return memory[profileId] || { examDefaults: {}, subjectFullScores: {} };
}

function setProfileMemory(profileId, profileMemory, options = {}) {
    if (!profileId) return;
    const memory = getFormMemoryAll();
    memory[profileId] = {
        examDefaults: profileMemory?.examDefaults || {},
        subjectFullScores: profileMemory?.subjectFullScores || {}
    };
    if (options.silent) {
        persistFormMemory(memory, { silent: true });
        return;
    }
    saveFormMemoryAll(memory);
}

function normalizeSubjectName(subjectName) {
    return String(subjectName || '').trim();
}

function rememberExamDefaults(profileId, { classTotal, gradeTotal }) {
    if (!profileId) return;

    const memory = getFormMemoryAll();
    const profileMemory = memory[profileId] || { examDefaults: {}, subjectFullScores: {} };

    if (classTotal) profileMemory.examDefaults.classTotal = Number(classTotal);
    if (gradeTotal) profileMemory.examDefaults.gradeTotal = Number(gradeTotal);

    memory[profileId] = profileMemory;
    saveFormMemoryAll(memory);
}

function getRememberedExamDefaults(profileId) {
    return getProfileMemory(profileId).examDefaults || {};
}

function rememberSubjectFullScore(profileId, subjectName, fullScore) {
    const normalizedName = normalizeSubjectName(subjectName);
    if (!profileId || !normalizedName || !fullScore) return;

    const memory = getFormMemoryAll();
    const profileMemory = memory[profileId] || { examDefaults: {}, subjectFullScores: {} };
    profileMemory.subjectFullScores[normalizedName] = Number(fullScore);

    memory[profileId] = profileMemory;
    saveFormMemoryAll(memory);
}

function getRememberedSubjectFullScore(profileId, subjectName) {
    const normalizedName = normalizeSubjectName(subjectName);
    if (!profileId || !normalizedName) return null;

    const remembered = getProfileMemory(profileId).subjectFullScores?.[normalizedName];
    return remembered ? Number(remembered) : null;
}

function estimateByteSize(value) {
    return new TextEncoder().encode(JSON.stringify(value)).length;
}

function getLocalProfileBundle(profileId) {
    const profiles = getProfiles();
    const profile = profiles.find(item => item.id === profileId);
    if (!profile) return null;

    const exams = getExams(profileId);
    const formMemory = getProfileMemory(profileId);
    const bundle = {
        profile: { ...profile },
        exams: exams.map(exam => ({ ...exam })),
        formMemory: { ...formMemory },
        exportedAt: new Date().toISOString()
    };

    return {
        profileId,
        profileName: profile.name,
        examCount: exams.length,
        dataSize: estimateByteSize(bundle),
        bundle
    };
}

function getAllLocalProfileBundles() {
    return getProfiles()
        .map(profile => getLocalProfileBundle(profile.id))
        .filter(Boolean);
}

function getExamTimestamp(exam) {
    const value = exam?.updatedAt || exam?.createdAt || exam?.endDate || exam?.startDate || '1970-01-01T00:00:00.000Z';
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeExamLists(localExams = [], cloudExams = []) {
    const examMap = new Map();

    for (const exam of localExams) {
        examMap.set(exam.id, { source: 'local', data: { ...exam } });
    }

    for (const exam of cloudExams) {
        const existing = examMap.get(exam.id);
        if (!existing || getExamTimestamp(exam) >= getExamTimestamp(existing.data)) {
            examMap.set(exam.id, { source: 'cloud', data: { ...exam } });
        }
    }

    return Array.from(examMap.values())
        .map(item => item.data)
        .sort((a, b) => getExamTimestamp(b) - getExamTimestamp(a));
}

function applyCloudProfileBundle(cloudBundle) {
    const payload = cloudBundle?.profile_data || cloudBundle?.bundle || cloudBundle;
    if (!payload?.profile) {
        throw new Error('云端档案数据结构无效');
    }

    const localProfiles = getProfiles();
    const localExams = getExamsAll();
    const incomingProfile = { ...payload.profile };
    const incomingExams = (payload.exams || []).map(exam => ({ ...exam, profileId: incomingProfile.id }));
    const existingProfileIndex = localProfiles.findIndex(profile => profile.id === incomingProfile.id);

    if (existingProfileIndex >= 0) {
        localProfiles[existingProfileIndex] = {
            ...localProfiles[existingProfileIndex],
            ...incomingProfile,
            name: incomingProfile.name || localProfiles[existingProfileIndex].name
        };
    } else {
        localProfiles.push(incomingProfile);
    }

    const otherExams = localExams.filter(exam => exam.profileId !== incomingProfile.id);
    const mergedProfileExams = mergeExamLists(
        localExams.filter(exam => exam.profileId === incomingProfile.id),
        incomingExams
    );

    persistProfiles(localProfiles, { silent: true });
    persistExams(otherExams.concat(mergedProfileExams), { silent: true });
    setProfileMemory(incomingProfile.id, payload.formMemory || {}, { silent: true });
}

export {
    EXAMS_KEY,
    PROFILES_KEY,
    ACTIVE_PROFILE_KEY,
    FORM_MEMORY_KEY,
    getProfiles,
    saveProfiles,
    getActiveProfileId,
    setActiveProfileId,
    createProfile,
    updateProfile,
    deleteProfile,
    migrateProfilesIfNeeded,
    getExams,
    getExamsAll,
    saveExams,
    getFormMemoryAll,
    saveFormMemoryAll,
    getProfileMemory,
    setProfileMemory,
    rememberExamDefaults,
    getRememberedExamDefaults,
    rememberSubjectFullScore,
    getRememberedSubjectFullScore,
    getLocalProfileBundle,
    getAllLocalProfileBundles,
    mergeExamLists,
    applyCloudProfileBundle,
};
