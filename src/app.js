// ===== 成绩管家 - 应用入口 =====
// 负责模块初始化、依赖注入、事件绑定、window 全局注册

import state from './store.js';
import { migrateProfilesIfNeeded, getExams, getExamsAll, saveExams, getActiveProfileId } from './storage.js';
import { setUpdateTrendChart, updateScoreMax } from './utils.js';
import { renderExamList, selectExam, selectSubject, setDependencies as setExamListDeps } from './exam-list.js';
import { renderExamDetail, openExamModal, closeExamModal, openScoreModal, editSubjectScore, closeScoreModal, editExam, deleteExam, setupConfirmModalEvents, setupExamFormSubmit, setupScoreFormSubmit, setupModalCloseEvents, startEditTotalScore, onManualTotalScoreInput, prepareCancelInlineTotalScore, cancelInlineTotalScore, saveInlineTotalScore, handleManualTotalScoreBlur, handleManualTotalScoreKeydown, confirmRestoreAutoTotalScore, setDependencies as setExamDetailDeps } from './exam-detail.js';
import { openBatchModal, closeBatchModal, addBatchSubject, setupBatchEvents, setDependencies as setBatchDeps } from './batch.js';
import { renderProfileSwitcher, renderProfileManager, switchToProfile, renameProfile, confirmDeleteProfile, addNewProfile, cancelAddProfile, setDependencies as setProfileDeps } from './profile.js';
import { initRadarChart, renderRadarCompareChips, toggleRadarCompare, updateRadarChart } from './chart-radar.js';
import { initCharts, updateTrendChart, updateChartTabs, updateChartsBySubject, setDependencies as setChartTrendDeps } from './chart-trend.js';
import { openChartZoom, closeChartZoom } from './chart-zoom.js';
import { setupImportExport, setDependencies as setImportExportDeps } from './import-export.js';
import { openShareExamReport, openShareProfileReport, closeShareReport, downloadReport, setupReportEvents } from './report.js';
import { setupDemoBtn, checkFirstLaunch, setDependencies as setDemoDataDeps } from './demo-data.js';

// ===== 依赖注入 =====

// refreshAll 需要在注入前定义
async function refreshAll() {
    renderProfileSwitcher();
    // 如果没有选中考试，自动选中最新一场
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
    if (settingsTab) settingsTab.classList.add('active');
    if (settingsSection) settingsSection.classList.add('active');

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

// toggleExamExclude 从 storage.js 移出，放在这里避免循环依赖
function toggleExamExclude(examId) {
    const allExams = getExamsAll();
    const exam = allExams.find(e => e.id === examId);
    if (!exam) return;
    exam.excluded = !exam.excluded;
    saveExams(allExams);
    refreshAll();
}

// 注入各模块的依赖
setExamListDeps({ renderExamDetail, updateRadarChart });
setExamDetailDeps({ refreshAll });
setBatchDeps({ refreshAll });
setProfileDeps({ refreshAll });
setChartTrendDeps({ updateRadarChart });
setImportExportDeps({ refreshAll });
setDemoDataDeps({ refreshAll });

// utils.js 的 updateCharts 需要调用 updateTrendChart
setUpdateTrendChart(updateTrendChart);

// ===== 事件绑定 =====

// 标签页切换
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async function() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        
        this.classList.add('active');
        document.getElementById('tab-' + this.dataset.tab).classList.add('active');
        
        if (this.dataset.tab === 'trend') {
            updateChartTabs();
            updateTrendChart();
            // 切换到成绩分析时，如果当前模式是雷达图且没有选中考试，默认选中最新
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

// 移动端菜单
document.getElementById('mobileMenuBtn').addEventListener('click', function() {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
});

document.getElementById('sidebarOverlay').addEventListener('click', function() {
    document.getElementById('sidebar').classList.remove('active');
    this.classList.remove('active');
});

// 档案下拉切换
document.getElementById('profileSelect').addEventListener('change', function() {
    switchToProfile(this.value);
});

// 档案管理按钮
document.getElementById('profileManageBtn').addEventListener('click', function() {
    openProfileSettings();
});

// 初始化 addProfileBtn
document.getElementById('addProfileBtn').addEventListener('click', addNewProfile);

// 模态框关闭事件
setupModalCloseEvents();
setupConfirmModalEvents();

// 表单提交
setupExamFormSubmit();
setupScoreFormSubmit();

// 批量填写事件
setupBatchEvents();

// 导入导出
setupImportExport();

// 示例数据
setupDemoBtn();

// 报告弹窗遮罩
setupReportEvents();

// 图表放大弹窗遮罩
document.getElementById('chartZoomOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeChartZoom();
});

// ===== 注册 window 全局函数（HTML onclick 需要）=====
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
window.openBatchModal = openBatchModal;
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

// ===== 初始化应用 =====
async function initApp() {
    migrateProfilesIfNeeded();
    renderProfileSwitcher();
    initCharts();
    initRadarChart();
    await checkFirstLaunch();
    await refreshAll();
}

initApp();
