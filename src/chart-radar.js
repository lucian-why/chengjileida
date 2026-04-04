import state from './store.js';
import { getExams, getActiveProfileId } from './storage.js';

// 雷达图配色：当前(红) + 对比1(蓝) + 对比2(橙)，高对比不冲突
export const RADAR_COMPARE_STYLES = [
    { bg: 'rgba(50, 120, 210, 0.12)',  border: '#3278D2', fill: true,  borderWidth: 3, pointRadius: 5, pointHoverRadius: 7, pointStyle: 'rect' },
    { bg: 'rgba(240, 160, 50, 0.12)',  border: '#F0A032', fill: true,  borderWidth: 3, pointRadius: 5, pointHoverRadius: 7, pointStyle: 'triangle' },
];

export function initRadarChart() {
    const ctx = document.getElementById('radarChart').getContext('2d');
    state.radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: {
                duration: 800,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        padding: 14,
                        usePointStyle: true,
                        pointStyleWidth: 10,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.raw === null || ctx.raw === undefined) return null;
                            const isCurrent = ctx.dataset._isCurrent;
                            if (!isCurrent) {
                                return ctx.dataset.label + ': ' + ctx.raw + '%';
                            }
                            const meta = ctx.dataset._subjectMeta;
                            if (!meta) return ctx.dataset.label + ': ' + ctx.raw + '%';
                            const info = meta[ctx.dataIndex];
                            if (!info) return null;
                            let text = ctx.dataset.label + ': ' + info.score + '/' + info.fullScore;
                            if (info.classRank) text += '  班' + info.classRank;
                            if (info.gradeRank) text += '  校' + info.gradeRank;
                            return text;
                        }
                    },
                    filter: function(tooltipItem) {
                        return tooltipItem.raw !== null && tooltipItem.raw !== undefined;
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        font: { size: 11 },
                        color: 'var(--text-secondary)',
                        backdropColor: 'transparent'
                    },
                    pointLabels: {
                        font: { size: 13, weight: '500' },
                        color: 'var(--text-primary)'
                    },
                    grid: {
                        color: 'rgba(128,128,128,0.15)'
                    },
                    angleLines: {
                        color: 'rgba(128,128,128,0.15)'
                    }
                }
            }
        }
    });
}

export function renderRadarCompareChips() {
    const exams = getExams(getActiveProfileId(), true);
    const chipsEl = document.getElementById('radarCompareChips');
    const hintEl = document.getElementById('radarCompareHint');
    const headerEl = document.querySelector('.radar-header');

    if (!state.currentExamId || exams.length <= 1) {
        headerEl.style.display = 'none';
        return;
    }
    headerEl.style.display = 'flex';

    // 按日期倒序排列
    const sorted = [...exams].sort((a, b) => new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt));

    // 清理已选：移除不存在的考试ID
    const validIds = sorted.map(e => e.id);
    state.selectedCompareIds = state.selectedCompareIds.filter(id => validIds.includes(id) && id !== state.currentExamId);

    let html = '';
    sorted.forEach((exam, idx) => {
        if (exam.id === state.currentExamId) {
            html += `<span class="radar-compare-chip current-exam">${exam.name}</span>`;
        } else {
            const isSelected = state.selectedCompareIds.includes(exam.id);
            const isFull = state.selectedCompareIds.length >= 2 && !isSelected;
            const examIdLiteral = JSON.stringify(exam.id);
            html += `<span class="radar-compare-chip${isSelected ? ' selected' : ''}${isFull ? ' disabled' : ''}" data-exam-id="${exam.id}" onclick='toggleRadarCompare(${examIdLiteral})'>${exam.name}</span>`;
        }
    });

    chipsEl.innerHTML = html;

    // 更新提示
    const count = state.selectedCompareIds.length;
    if (count === 0) {
        hintEl.textContent = '点击选择考试进行对比（最多2场）';
    } else {
        hintEl.textContent = `已选 ${count}/2 场考试`;
    }
}

export function toggleRadarCompare(examId) {
    const idx = state.selectedCompareIds.indexOf(examId);
    if (idx >= 0) {
        state.selectedCompareIds.splice(idx, 1);
    } else {
        if (state.selectedCompareIds.length >= 2) return;
        state.selectedCompareIds.push(examId);
    }
    renderRadarCompareChips();
    updateRadarChart();
}

export function updateRadarChart() {
    const exams = getExams(getActiveProfileId());
    const container = document.querySelector('.radar-container');
    const emptyEl = document.getElementById('radarEmpty');
    const headerEl = document.querySelector('.radar-header');
    const currentNameEl = document.getElementById('radarCurrentExamName');

    if (!state.currentExamId || exams.length === 0) {
        container.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = '选择考试后查看各科得分率分析';
        headerEl.style.display = 'none';
        if (state.radarChart) {
            state.radarChart.data.labels = [];
            state.radarChart.data.datasets = [];
            state.radarChart.update();
        }
        return;
    }

    // 当前考试
    const currentExam = exams.find(e => e.id === state.currentExamId);
    if (!currentExam || !currentExam.subjects || currentExam.subjects.length < 3) {
        container.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = '当前考试科目不足3科，无法生成雷达图';
        headerEl.style.display = 'none';
        if (state.radarChart) {
            state.radarChart.data.labels = [];
            state.radarChart.data.datasets = [];
            state.radarChart.update();
        }
        return;
    }

    // 过滤有满分的科目
    const currentSubjects = currentExam.subjects.filter(s => s.fullScore && s.fullScore > 0);
    if (currentSubjects.length < 3) {
        container.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = '至少需要3科有满分数据才能生成雷达图';
        headerEl.style.display = 'none';
        if (state.radarChart) {
            state.radarChart.data.labels = [];
            state.radarChart.data.datasets = [];
            state.radarChart.update();
        }
        return;
    }

    container.style.display = 'block';
    emptyEl.style.display = 'none';
    currentNameEl.textContent = currentExam.name;

    const labels = currentSubjects.map(s => s.name);
    const currentData = currentSubjects.map(s => Math.round(s.score / s.fullScore * 100));

    // 当前考试的科目元信息（tooltip 用）
    const currentMeta = currentSubjects.map(s => ({
        score: s.score,
        fullScore: s.fullScore,
        classRank: s.classRank || null,
        gradeRank: s.gradeRank || null
    }));

    // 当前考试数据集（红色，实心填充，最大）
    const currentStyle = { bg: 'rgba(232, 100, 60, 0.15)', border: '#E8643C' };
    const datasets = [{
        label: currentExam.name,
        data: currentData,
        _subjectMeta: currentMeta,
        _isCurrent: true,
        backgroundColor: currentStyle.bg,
        borderColor: currentStyle.border,
        borderWidth: 3,
        borderDash: [],
        pointBackgroundColor: currentStyle.border,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointStyle: 'circle',
        fill: true
    }];

    // 对比考试数据集（不填充，不同点样式）
    state.selectedCompareIds.forEach((compId, i) => {
        const compExam = exams.find(e => e.id === compId);
        if (!compExam) return;
        const compSubjects = compExam.subjects || [];
        const compData = labels.map(name => {
            const cs = compSubjects.find(s => s.name === name);
            if (cs && cs.fullScore && cs.fullScore > 0) {
                return Math.round(cs.score / cs.fullScore * 100);
            }
            return null;
        });
        // 对比考试的科目元信息
        const compMeta = labels.map(name => {
            const cs = compSubjects.find(s => s.name === name);
            if (cs && cs.fullScore && cs.fullScore > 0) {
                return { score: cs.score, fullScore: cs.fullScore, classRank: cs.classRank || null, gradeRank: cs.gradeRank || null };
            }
            return null;
        });
        const style = RADAR_COMPARE_STYLES[i % RADAR_COMPARE_STYLES.length];
        datasets.push({
            label: compExam.name,
            data: compData,
            _subjectMeta: compMeta,
            _isCurrent: false,
            backgroundColor: style.fill ? style.bg : 'transparent',
            borderColor: style.border,
            borderWidth: style.borderWidth,
            borderDash: [],
            pointBackgroundColor: style.border,
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5,
            pointRadius: style.pointRadius,
            pointHoverRadius: style.pointHoverRadius,
            pointStyle: style.pointStyle,
            fill: style.fill
        });
    });

    // 渲染对比 chip 选择器
    renderRadarCompareChips();

    state.radarChart.data.labels = labels;
    state.radarChart.data.datasets = datasets;
    state.radarChart.update();

    // 最强/最弱科目分析
    const sorted = [...currentSubjects].map(s => ({
        name: s.name, score: s.score, fullScore: s.fullScore,
        rate: s.score / s.fullScore
    })).sort((a, b) => b.rate - a.rate);
    const summaryEl = document.getElementById('radarSummary');
    document.getElementById('radarBestName').textContent = sorted[0].name;
    document.getElementById('radarBestDetail').textContent = sorted[0].score + '/' + sorted[0].fullScore;
    document.getElementById('radarBestRate').textContent = Math.round(sorted[0].rate * 100) + '%';
    const worst = sorted[sorted.length - 1];
    document.getElementById('radarWorstName').textContent = worst.name;
    document.getElementById('radarWorstDetail').textContent = worst.score + '/' + worst.fullScore;
    document.getElementById('radarWorstRate').textContent = Math.round(worst.rate * 100) + '%';
    summaryEl.style.display = 'flex';
}
