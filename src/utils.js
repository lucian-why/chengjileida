/**
 * utils.js — 工具函数
 * 来源：index-legacy-v2.html
 *   - escHtml (第 3322-3327 行)
 *   - updateScoreMax (第 3235-3242 行)
 *   - saveTrendMode (第 2699-2704 行)
 *   - updateCharts (第 2827-2829 行)
 */

import state from './store.js';

export function escHtml(str) {
    if (str === null || str === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

export function updateScoreMax() {
    const fullScore = parseInt(document.getElementById('scoreFull').value) || 100;
    const scoreInput = document.getElementById('scoreValue');
    scoreInput.max = fullScore;
    // 如果当前成绩超过满分，自动调整
    if (parseInt(scoreInput.value) > fullScore) {
        scoreInput.value = fullScore;
    }
}

export function getAutoTotalScore(exam) {
    const subjects = (exam && exam.subjects) || [];
    return subjects.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
}

export function getDisplayTotalScore(exam) {
    if (!exam) return 0;
    const manual = exam.manualTotalScore;
    if (manual !== '' && manual !== null && manual !== undefined) {
        const value = Number(manual);
        if (!Number.isNaN(value)) return value;
    }
    return getAutoTotalScore(exam);
}

export function hasManualTotalMismatch(exam) {
    if (!exam || !exam.subjects || exam.subjects.length === 0) return false;
    const manual = exam.manualTotalScore;
    if (manual === '' || manual === null || manual === undefined) return false;
    const manualValue = Number(manual);
    if (Number.isNaN(manualValue)) return false;
    return manualValue !== getAutoTotalScore(exam);
}

export function saveTrendMode() {
    localStorage.setItem('xueji_trend_mode', JSON.stringify({
        mode: state.trendAnalysisMode,
        rankType: state.trendRankType
    }));
}

// updateCharts 内部调用 updateTrendChart()，通过注入解决循环依赖
let _updateTrendChartFn = null;

export function updateCharts() {
    if (_updateTrendChartFn) {
        _updateTrendChartFn();
    }
}

export function setUpdateTrendChart(fn) {
    _updateTrendChartFn = fn;
}
