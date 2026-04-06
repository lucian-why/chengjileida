/**
 * storage.js - 数据存储层
 */

const EXAMS_KEY = 'xueji_exams';
const PROFILES_KEY = 'xueji_profiles';
const ACTIVE_PROFILE_KEY = 'xueji_active_profile';
const FORM_MEMORY_KEY = 'xueji_form_memory';

function getProfiles() {
    const data = localStorage.getItem(PROFILES_KEY);
    return data ? JSON.parse(data) : [];
}

function saveProfiles(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
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

function createProfile(name) {
    const profiles = getProfiles();
    const id = 'profile_' + Date.now();
    profiles.push({ id, name, createdAt: new Date().toISOString() });
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
    saveProfiles(profiles);

    const exams = getExamsAll().filter(exam => exam.profileId !== id);
    saveExams(exams);

    const memory = getFormMemoryAll();
    if (memory[id]) {
        delete memory[id];
        saveFormMemoryAll(memory);
    }

    if (getActiveProfileId() === id && profiles.length > 0) {
        setActiveProfileId(profiles[0].id);
    }
}

function migrateProfilesIfNeeded() {
    const profiles = getProfiles();
    if (profiles.length > 0) {
        if (!localStorage.getItem(ACTIVE_PROFILE_KEY) && profiles[0]) {
            setActiveProfileId(profiles[0].id);
        }
        return;
    }

    const exams = getExamsAll();
    const defaultId = createProfile('人生档案');
    setActiveProfileId(defaultId);

    if (exams.length === 0) return;

    exams.forEach(exam => {
        exam.profileId = defaultId;
    });
    saveExams(exams);
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
    localStorage.setItem(EXAMS_KEY, JSON.stringify(exams));
}

function getFormMemoryAll() {
    const data = localStorage.getItem(FORM_MEMORY_KEY);
    return data ? JSON.parse(data) : {};
}

function saveFormMemoryAll(memory) {
    localStorage.setItem(FORM_MEMORY_KEY, JSON.stringify(memory));
}

function getProfileMemory(profileId) {
    const memory = getFormMemoryAll();
    return memory[profileId] || { examDefaults: {}, subjectFullScores: {} };
}

function setProfileMemory(profileId, profileMemory) {
    if (!profileId) return;
    const memory = getFormMemoryAll();
    memory[profileId] = {
        examDefaults: profileMemory?.examDefaults || {},
        subjectFullScores: profileMemory?.subjectFullScores || {}
    };
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

    saveProfiles(localProfiles);
    saveExams(otherExams.concat(mergedProfileExams));
    setProfileMemory(incomingProfile.id, payload.formMemory || {});
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
