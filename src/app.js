import state from './store.js';
import { migrateProfilesIfNeeded, getExams, getExamsAll, saveExams, getActiveProfileId } from './storage.js';
import { initSupabase, isAuthEnabled, getCurrentUser, onAuthStateChange, signOut } from './auth.js';
import { showLoginPage, hideLoginPage, renderAuthStatus, renderGuestAuthStatus, clearAuthStatus, setLoginSuccessHandler, setLogoutHandler, setAuthSyncStatus } from './login-ui.js';
import { showConfirmDialog, showToast } from './modal.js';
import { setUpdateTrendChart, updateScoreMax } from './utils.js';
import { renderExamList, selectExam, selectSubject, setDependencies as setExamListDeps } from './exam-list.js';
import { renderExamDetail, openExamModal, openScoreModal, editSubjectScore, deleteSubjectScore, editExam, deleteExam, setupConfirmModalEvents, setupExamFormSubmit, setupScoreFormSubmit, setupModalCloseEvents, startEditTotalScore, onManualTotalScoreInput, prepareCancelInlineTotalScore, cancelInlineTotalScore, saveInlineTotalScore, handleManualTotalScoreBlur, handleManualTotalScoreKeydown, confirmRestoreAutoTotalScore, setDependencies as setExamDetailDeps } from './exam-detail.js';
import { openBatchModal, addBatchSubject, setupBatchEvents, setDependencies as setBatchDeps } from './batch.js';
import { renderProfileSwitcher, renderProfileManager, switchToProfile, renameProfile, confirmDeleteProfile, addNewProfile, setDependencies as setProfileDeps } from './profile.js';
import { initRadarChart, toggleRadarCompare, updateRadarChart } from './chart-radar.js';
import { initCharts, updateTrendChart, updateChartTabs, setDependencies as setChartTrendDeps } from './chart-trend.js';
import { openChartZoom, closeChartZoom } from './chart-zoom.js';
import { setupImportExport, setDependencies as setImportExportDeps } from './import-export.js';
import { openShareExamReport, openShareProfileReport, closeShareReport, downloadReport, setupReportEvents } from './report.js';
import { setupDemoBtn, checkFirstLaunch, setDependencies as setDemoDataDeps } from './demo-data.js';
import { openCloudSyncPanel, closeCloudSyncPanel, setDependencies as setCloudSyncDeps } from './cloud-sync-ui.js';
import { ENCOURAGEMENT_SCENES, leaveEncouragementScene, restoreActiveEncouragementScene } from './encouragement-copy.js';
import { startAdminApp } from './admin-app.js';
import { initAI, scheduleAIAnalysisRefresh, refreshAIAnalysisCard } from './ai.js';
import { initAIChat, openAIChat, closeAIChat, renderReportEntry, renderCompareEntry, renderGlobalEntry, setLastAnalysisText } from './ai-chat.js';
import { initVipUI, renderVipStatus } from './vip-ui.js';
import { initAutoSync, syncAfterLogin, handleLogoutAutoSync, getAutoSyncStatusText } from './auto-sync.js';

let appEventsBound = false;
let appCoreReady = false;
let authWatcherBound = false;
let pendingPostLoginAction = '';

async function refreshAll() {
    renderProfileSwitcher();
    const activeEmptySceneKey = restoreActiveEncouragementScene();

    if (!state.currentExamId) {
        const exams = getExams(getActiveProfileId());
        if (exams.length > 0 && !activeEmptySceneKey) {
            const sorted = [...exams].sort((a, b) => new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt));
            state.currentExamId = sorted[0].id;
            state.detailEmptySceneKey = '';
            leaveEncouragementScene(ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY);
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

async function ensureCloudAuth() {
    if (!isAuthEnabled()) {
        showToast({ icon: '⚙️', iconType: 'warning', title: '未启用云端登录', message: '当前部署环境没有注入 腾讯云登录变量，请检查 VITE_TCB_ENV_ID 和前端配置后重新部署。' });
        return false;
    }

    const user = await getCurrentUser();
    if (user) {
        return true;
    }

    pendingPostLoginAction = 'cloud-sync';
    showLoginPage('云端同步需要先登录，请输入邮箱和验证码完成登录。');
    return false;
}

async function handleCloudSyncEntry() {
    if (!await ensureCloudAuth()) {
        return;
    }
    await openCloudSyncPanel();
}

setExamListDeps({ renderExamDetail, updateRadarChart });
setExamDetailDeps({ refreshAll });
setBatchDeps({ refreshAll });
setProfileDeps({ refreshAll });
setChartTrendDeps({ updateRadarChart, onTrendChartRendered: scheduleAIAnalysisRefresh });
setImportExportDeps({ refreshAll });
setDemoDataDeps({ refreshAll });
setCloudSyncDeps({ refreshAll, ensureCloudAuth: handleCloudSyncEntry });
setUpdateTrendChart(updateTrendChart);

function bindWindowGlobals() {
    window.selectExam = selectExam;
    window.selectSubject = selectSubject;
    window.toggleExamExclude = toggleExamExclude;
    window.editExam = editExam;
    window.deleteExam = deleteExam;
    window.editSubjectScore = editSubjectScore;
    window.deleteSubjectScore = deleteSubjectScore;
    window.startEditTotalScore = startEditTotalScore;
    window.onManualTotalScoreInput = onManualTotalScoreInput;
    window.prepareCancelInlineTotalScore = prepareCancelInlineTotalScore;
    window.cancelInlineTotalScore = cancelInlineTotalScore;
    window.saveInlineTotalScore = saveInlineTotalScore;
    window.handleManualTotalScoreBlur = handleManualTotalScoreBlur;
    window.handleManualTotalScoreKeydown = handleManualTotalScoreKeydown;
    window.confirmRestoreAutoTotalScore = confirmRestoreAutoTotalScore;
    window.openScoreModal = openScoreModal;
    window.openBatchModal = openBatchModal;
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
    window.adjustScoreFull = function(delta) {
        const el = document.getElementById('scoreFull');
        const current = parseInt(el.value) || 100;
        const next = Math.max(1, current + delta);
        el.value = next;
        updateScoreMax();
    };
    window.openChartZoom = openChartZoom;
    window.closeChartZoom = closeChartZoom;
    window.closeCloudSyncPanel = closeCloudSyncPanel;
    window.openAIChat = openAIChat;
    window.closeAIChat = closeAIChat;
}

function bindAppEvents() {
    if (appEventsBound) return;

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', async function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));

            if (this.dataset.tab !== 'exam') {
                leaveEncouragementScene(ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY);
            }

            this.classList.add('active');
            document.getElementById(`tab-${this.dataset.tab}`)?.classList.add('active');

            if (this.dataset.tab === 'exam') {
                await renderExamDetail();
            }

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
                renderVipStatus();
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
    document.getElementById('cloudSyncBtn')?.addEventListener('click', async () => {
        const user = isAuthEnabled() ? await getCurrentUser() : null;
        if (!user) {
            showConfirmDialog({
                icon: '🗑️',
                iconType: 'info',
                title: '回收站需要登录',
                message: '登录后可查看和管理已删除的云端档案。',
                okText: '去登录',
                okClass: 'confirm-ok-btn blue',
                onConfirm: async () => {
                    await ensureCloudAuth();
                }
            });
            return;
        }

        await openCloudSyncPanel();
    });

    setupModalCloseEvents();
    setupConfirmModalEvents();
    setupExamFormSubmit();
    setupScoreFormSubmit();
    setupBatchEvents();
        setupImportExport();
        setupDemoBtn();
        setupReportEvents();
        initAI();
        initAIChat();
        initVipUI();
        renderCompareEntry();
        renderGlobalEntry();

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
    setAuthSyncStatus(getAutoSyncStatusText(), 'info', true);
    await initCoreApp();
    await syncAfterLogin();

    if (pendingPostLoginAction === 'cloud-sync') {
        pendingPostLoginAction = '';
        await openCloudSyncPanel();
    }
}

function setupAuthHandlers() {
    setLoginSuccessHandler(handleSignedIn);
    setLogoutHandler(async () => {
        await signOut();
        renderGuestAuthStatus();
        closeCloudSyncPanel();
        hideLoginPage();
        handleLogoutAutoSync();
        await refreshAIAnalysisCard({ force: true });
        showToast({ icon: '👋', title: '已退出登录', message: '网页仍可继续使用，云端同步功能需要重新登录。' });
    });

    if (authWatcherBound) return;

    onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            renderGuestAuthStatus();
            closeCloudSyncPanel();
            hideLoginPage();
            handleLogoutAutoSync();
            await refreshAIAnalysisCard({ force: true });
            return;
        }

        if (session?.user) {
            await handleSignedIn(session.user);
        }
    });

    authWatcherBound = true;
}

async function startApp() {
    if (window.location.pathname === '/admin') {
        window.location.replace('/admin/');
        return;
    }

    const isAdminPage = /\/admin\/?$/.test(window.location.pathname);
    if (isAdminPage) {
        await startAdminApp();
        return;
    }

    initSupabase();
    initAutoSync({
        refreshAll,
        onStatusChange: ({ message, type, visible }) => setAuthSyncStatus(message, type, visible)
    });

    await initCoreApp();
    const user = await getCurrentUser();

    if (isAuthEnabled()) {
        setupAuthHandlers();
    }

    if (!user) {
        if (!isAuthEnabled()) {
            clearAuthStatus();
        } else {
            renderGuestAuthStatus();
            hideLoginPage();
            handleLogoutAutoSync();
        }
        return;
    }

    await handleSignedIn(user);
}

startApp();




