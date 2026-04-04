import state from './store.js';
import { migrateProfilesIfNeeded, getExams, getExamsAll, saveExams, getActiveProfileId } from './storage.js';
import { initSupabase, isAuthEnabled, getCurrentUser, onAuthStateChange, signOut } from './auth.js';
import { showLoginPage, hideLoginPage, renderAuthStatus, clearAuthStatus, setLoginSuccessHandler, setLogoutHandler } from './login-ui.js';
import { setUpdateTrendChart, updateScoreMax } from './utils.js';
import { renderExamList, selectExam, selectSubject, setDependencies as setExamListDeps } from './exam-list.js';
import { renderExamDetail, openExamModal, openScoreModal, editSubjectScore, editExam, deleteExam, setupConfirmModalEvents, setupExamFormSubmit, setupScoreFormSubmit, setupModalCloseEvents, startEditTotalScore, onManualTotalScoreInput, prepareCancelInlineTotalScore, cancelInlineTotalScore, saveInlineTotalScore, handleManualTotalScoreBlur, handleManualTotalScoreKeydown, confirmRestoreAutoTotalScore, setDependencies as setExamDetailDeps } from './exam-detail.js';
import { addBatchSubject, setupBatchEvents, setDependencies as setBatchDeps } from './batch.js';
import { renderProfileSwitcher, renderProfileManager, switchToProfile, renameProfile, confirmDeleteProfile, addNewProfile, setDependencies as setProfileDeps } from './profile.js';
import { initRadarChart, toggleRadarCompare, updateRadarChart } from './chart-radar.js';
import { initCharts, updateTrendChart, updateChartTabs, setDependencies as setChartTrendDeps } from './chart-trend.js';
import { openChartZoom, closeChartZoom } from './chart-zoom.js';
import { setupImportExport, setDependencies as setImportExportDeps } from './import-export.js';
import { openShareExamReport, openShareProfileReport, closeShareReport, downloadReport, setupReportEvents } from './report.js';
import { setupDemoBtn, checkFirstLaunch, setDependencies as setDemoDataDeps } from './demo-data.js';

let appEventsBound = false;
let appCoreReady = false;
let authWatcherBound = false;

async function refreshAll() {
    renderProfileSwitcher();

    if (!state.currentExamId) {
        const exams = getExams(getActiveProfileId());
        if (exams.length > 0) {
            const sorted = [...exams].sort((a, b) => new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt));
            state.currentExamId = sorted[0].id;
        }
    }

    await renderExamList();
    await renderExamDetail();

    if (state.trendAnalysisMode === 'radar') {
        updateRadarChart();
    }

    updateChartTabs();
    updateTrendChart();
}

function openProfileSettings() {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));

    const settingsTab = document.querySelector('.tab[data-tab="settings"]');
    const settingsSection = document.getElementById('tab-settings');
    settingsTab?.classList.add('active');
    settingsSection?.classList.add('active');

    renderProfileManager();

    document.getElementById('sidebar')?.classList.remove('active');
    document.getElementById('sidebarOverlay')?.classList.remove('active');

    requestAnimationFrame(() => {
        const profileList = document.getElementById('profileList');
        const profileCard = profileList?.closest('.card');
        const target = profileCard || settingsSection;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function toggleExamExclude(examId) {
    const allExams = getExamsAll();
    const exam = allExams.find(e => e.id === examId);
    if (!exam) return;
    exam.excluded = !exam.excluded;
    saveExams(allExams);
    refreshAll();
}

setExamListDeps({ renderExamDetail, updateRadarChart });
setExamDetailDeps({ refreshAll });
setBatchDeps({ refreshAll });
setProfileDeps({ refreshAll });
setChartTrendDeps({ updateRadarChart });
setImportExportDeps({ refreshAll });
setDemoDataDeps({ refreshAll });
setUpdateTrendChart(updateTrendChart);

function bindWindowGlobals() {
    window.selectExam = selectExam;
    window.selectSubject = selectSubject;
    window.toggleExamExclude = toggleExamExclude;
    window.editExam = editExam;
    window.deleteExam = deleteExam;
    window.editSubjectScore = editSubjectScore;
    window.startEditTotalScore = startEditTotalScore;
    window.onManualTotalScoreInput = onManualTotalScoreInput;
    window.prepareCancelInlineTotalScore = prepareCancelInlineTotalScore;
    window.cancelInlineTotalScore = cancelInlineTotalScore;
    window.saveInlineTotalScore = saveInlineTotalScore;
    window.handleManualTotalScoreBlur = handleManualTotalScoreBlur;
    window.handleManualTotalScoreKeydown = handleManualTotalScoreKeydown;
    window.confirmRestoreAutoTotalScore = confirmRestoreAutoTotalScore;
    window.openScoreModal = openScoreModal;
    window.addBatchSubject = addBatchSubject;
    window.openShareExamReport = openShareExamReport;
    window.openShareProfileReport = openShareProfileReport;
    window.downloadReport = downloadReport;
    window.closeShareReport = closeShareReport;
    window.switchToProfile = switchToProfile;
    window.renameProfile = renameProfile;
    window.confirmDeleteProfile = confirmDeleteProfile;
    window.toggleRadarCompare = toggleRadarCompare;
    window.updateScoreMax = updateScoreMax;
    window.openChartZoom = openChartZoom;
    window.closeChartZoom = closeChartZoom;
}

function bindAppEvents() {
    if (appEventsBound) return;

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', async function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));

            this.classList.add('active');
            document.getElementById(`tab-${this.dataset.tab}`)?.classList.add('active');

            if (this.dataset.tab === 'trend') {
                updateChartTabs();
                updateTrendChart();
                if (state.trendAnalysisMode === 'radar' && !state.currentExamId) {
                    const exams = getExams(getActiveProfileId());
                    if (exams.length > 0) {
                        const sorted = [...exams].sort((a, b) => new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt));
                        state.currentExamId = sorted[0].id;
                        await renderExamList();
                        updateRadarChart();
                    }
                }
            }

            if (this.dataset.tab === 'settings') {
                renderProfileManager();
            }
        });
    });

    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.add('active');
        document.getElementById('sidebarOverlay')?.classList.add('active');
    });

    document.getElementById('sidebarOverlay')?.addEventListener('click', function() {
        document.getElementById('sidebar')?.classList.remove('active');
        this.classList.remove('active');
    });

    document.getElementById('profileManageBtn')?.addEventListener('click', openProfileSettings);
    document.getElementById('addProfileBtn')?.addEventListener('click', addNewProfile);

    setupModalCloseEvents();
    setupConfirmModalEvents();
    setupExamFormSubmit();
    setupScoreFormSubmit();
    setupBatchEvents();
    setupImportExport();
    setupDemoBtn();
    setupReportEvents();

    document.getElementById('chartZoomOverlay')?.addEventListener('click', function(event) {
        if (event.target === this) closeChartZoom();
    });

    appEventsBound = true;
}

async function initCoreApp() {
    if (!appCoreReady) {
        migrateProfilesIfNeeded();
        initCharts();
        initRadarChart();
        bindWindowGlobals();
        bindAppEvents();
        appCoreReady = true;
    }

    renderProfileSwitcher();
    await checkFirstLaunch();
    await refreshAll();
}

async function handleSignedIn(user) {
    hideLoginPage();
    renderAuthStatus(user);
    await initCoreApp();
}

function setupAuthHandlers() {
    setLoginSuccessHandler(handleSignedIn);
    setLogoutHandler(async () => {
        await signOut();
        clearAuthStatus();
        showLoginPage('已退出登录');
    });

    if (authWatcherBound) return;

    onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            clearAuthStatus();
            showLoginPage('请登录后继续使用云端功能');
            return;
        }

        if (session?.user) {
            await handleSignedIn(session.user);
        }
    });

    authWatcherBound = true;
}

async function startApp() {
    initSupabase();

    if (!isAuthEnabled()) {
        clearAuthStatus();
        await initCoreApp();
        return;
    }

    setupAuthHandlers();
    const user = await getCurrentUser();
    if (!user) {
        clearAuthStatus();
        showLoginPage('请先登录，开启云端保存与同步。');
        return;
    }

    await handleSignedIn(user);
}

startApp();
