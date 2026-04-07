/**
 * store.js — 全局状态管理
 * 来源：index-legacy-v2.html 各处散布的全局变量
 *   - 第 2063-2068 行: currentExamId, trendChart, trendAnalysisMode, trendRankType
 *   - 第 2316-2317 行: radarChart, selectedCompareIds
 *   - 第 2832-2833 行: zoomTrendChart, zoomRadarChart
 *   - 第 3409 行: pendingDeleteExamId
 *   - 第 3653 行: _confirmCallback
 *   - 第 4187-4188 行: _reportType, _reportData
 *   - 第 3250 行: batchList
 */

// 集中状态管理 - 使用导出对象让各模块可以读写
const state = {
    currentExamId: null,
    detailEmptySceneKey: '',
    trendChart: null,
    trendAnalysisMode: 'score', // 'score' 或 'rank'
    trendRankType: 'class',     // 'class' 或 'grade'（排名模式下）
    radarChart: null,
    selectedCompareIds: [],     // 已选对比考试ID列表（存数字类型）
    zoomTrendChart: null,
    zoomRadarChart: null,
    pendingDeleteExamId: null,
    isEditingTotalScore: false,
    manualTotalDraft: '',
    _skipTotalBlurSave: false,
    _confirmCallback: null,
    _reportType: '',            // 'exam' 或 'profile'
    _reportData: null,
    batchList: [],
    encouragementCopyCache: {},
};

export default state;
