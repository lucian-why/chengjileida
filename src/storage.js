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

// 首次启动时至少保证存在一个默认档案
function migrateProfilesIfNeeded() {
    const profiles = getProfiles();
    if (profiles.length > 0) {
        if (!localStorage.getItem(ACTIVE_PROFILE_KEY) && profiles[0]) {
            setActiveProfileId(profiles[0].id);
        }
        return;
    }

    const exams = getExamsAll();
    const defaultId = createProfile('默认档案');
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
    rememberExamDefaults,
    getRememberedExamDefaults,
    rememberSubjectFullScore,
    getRememberedSubjectFullScore,
};
