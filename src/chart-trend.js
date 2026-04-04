import state from './store.js';
import { getExams, getActiveProfileId } from './storage.js';
import { saveTrendMode, getDisplayTotalScore } from './utils.js';

export const CHART_COLORS = {
    accent: '#e8a87c',
    accentBg: 'rgba(232, 168, 124, 0.1)',
    blue: '#7ca9c9',
    blueBg: 'rgba(124, 169, 201, 0.1)',
    purple: '#9b8dc4',
    purpleBg: 'rgba(155, 141, 196, 0.1)',
};

// 注入外部依赖
let _updateRadarChart = null;

export function setDependencies({ updateRadarChart }) {
    _updateRadarChart = updateRadarChart;
}

export function initCharts() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    state.trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '成绩',
                data: [],
                borderColor: CHART_COLORS.accent,
                backgroundColor: CHART_COLORS.accentBg,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: CHART_COLORS.accent,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: false, min: 0, max: 100, grid: { color: '#f0ebe4' } },
                x: { grid: { display: false } }
            }
        }
    });

    // 加载上次的成绩分析状态
    const saved = localStorage.getItem('xueji_trend_mode');
    if (saved) {
        try {
            const s = JSON.parse(saved);
            state.trendAnalysisMode = s.mode || 'score';
            state.trendRankType = s.rankType || 'class';
        } catch(e) {}
    }

    // 恢复分析模式的 UI 状态
    document.querySelectorAll('#analysisModeTabs .chart-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.mode === state.trendAnalysisMode);
    });
    const trendCard = document.getElementById('trendCard');
    const radarCard = document.getElementById('radarCard');
    if (state.trendAnalysisMode === 'radar') {
        trendCard.style.display = 'none';
        radarCard.style.display = 'block';
    } else {
        trendCard.style.display = 'block';
        radarCard.style.display = 'none';
    }

    // 绑定分析模式切换事件
    document.getElementById('analysisModeTabs').addEventListener('click', function(e) {
        const tab = e.target.closest('.chart-tab');
        if (!tab) return;
        this.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.trendAnalysisMode = tab.dataset.mode;
        saveTrendMode();

        const trendCard = document.getElementById('trendCard');
        const radarCard = document.getElementById('radarCard');

        if (state.trendAnalysisMode === 'radar') {
            trendCard.style.display = 'none';
            radarCard.style.display = 'block';
            if (_updateRadarChart) _updateRadarChart();
        } else {
            trendCard.style.display = 'block';
            radarCard.style.display = 'none';
            updateChartTabs();
            updateTrendChart();
        }
    });

    // 绑定排名类型下拉切换
    document.getElementById('rankTypeSelect').addEventListener('change', function() {
        state.trendRankType = this.value;
        saveTrendMode();
        updateTrendChart();
    });
}

export function updateTrendChart() {
    const exams = getExams(getActiveProfileId(), true);
    const sortedExams = [...exams].sort((a, b) => new Date(a.startDate || a.createdAt) - new Date(b.startDate || b.createdAt));

    // 确保canvas可见（清除可能存在的空状态提示）
    const container = state.trendChart.canvas.parentElement;
    let hint = container.querySelector('.trend-empty-hint');
    if (hint) hint.style.display = 'none';
    state.trendChart.canvas.style.display = '';

    if (state.trendAnalysisMode === 'rank') {
        updateRankChart(sortedExams);
    } else {
        updateScoreChart(sortedExams);
    }
}

// 分数趋势模式
function updateScoreChart(sortedExams) {
    const activeTab = document.querySelector('#chartTabs .chart-tab.active');
    const selectedSubject = activeTab ? activeTab.dataset.subject : null;

    let data, label;
    if (!selectedSubject || activeTab.dataset.chart === 'total') {
        data = sortedExams.map(exam => {
            const subjects = exam.subjects || [];
            if (subjects.length === 0) return null;
            const total = getDisplayTotalScore(exam);
            return { name: exam.name, value: total };
        }).filter(e => e !== null);
        label = '总分';
    } else {
        data = sortedExams.map(exam => {
            const record = (exam.subjects || []).find(s => s.name === selectedSubject);
            return record ? { name: exam.name, value: record.score } : null;
        }).filter(e => e !== null);
        label = selectedSubject;
    }

    state.trendChart.data.labels = data.map(e => e.name);
    state.trendChart.data.datasets[0].data = data.map(e => e.value);
    state.trendChart.data.datasets[0].label = label;
    state.trendChart.data.datasets[0].borderColor = CHART_COLORS.accent;
    state.trendChart.data.datasets[0].backgroundColor = CHART_COLORS.accentBg;
    state.trendChart.data.datasets[0].pointBackgroundColor = CHART_COLORS.accent;
    state.trendChart.options.scales.y.reverse = false;
    state.trendChart.options.scales.y.beginAtZero = false;
    state.trendChart.options.scales.y.max = undefined;
    state.trendChart.options.scales.y.title = { display: false };
    state.trendChart.update();
}

// 排名趋势模式
function updateRankChart(sortedExams) {
    const activeTab = document.querySelector('#chartTabs .chart-tab.active');
    const selectedSubject = activeTab ? activeTab.dataset.subject : null;
    const isTotal = !selectedSubject || activeTab.dataset.chart === 'total';

    // 从下拉列表获取排名类型
    state.trendRankType = document.getElementById('rankTypeSelect').value;
    const rankKey = state.trendRankType === 'class' ? 'classRank' : 'gradeRank';
    const rankLabelPrefix = state.trendRankType === 'class' ? '班级排名' : '年级排名';

    let data;
    if (isTotal) {
        // 总分排名：从 exam 的 totalClassRank/totalGradeRank 取
        const totalRankKey = state.trendRankType === 'class' ? 'totalClassRank' : 'totalGradeRank';
        data = sortedExams.map(exam => {
            const rank = exam[totalRankKey];
            return rank ? { name: exam.name, value: rank } : null;
        }).filter(e => e !== null);
    } else {
        // 单科排名
        data = sortedExams.map(exam => {
            const record = (exam.subjects || []).find(s => s.name === selectedSubject);
            const rank = record ? record[rankKey] : null;
            return rank ? { name: exam.name, value: rank } : null;
        }).filter(e => e !== null);
    }

    state.trendChart.data.labels = data.map(e => e.name);
    state.trendChart.data.datasets[0].data = data.map(e => e.value);
    state.trendChart.data.datasets[0].label = (isTotal ? '总分' : selectedSubject) + ' - ' + rankLabelPrefix;

    // 排名模式样式：班级蓝色，年级紫色
    const color = state.trendRankType === 'class' ? CHART_COLORS.blue : CHART_COLORS.purple;
    const bgColor = state.trendRankType === 'class' ? CHART_COLORS.blueBg : CHART_COLORS.purpleBg;
    state.trendChart.data.datasets[0].borderColor = color;
    state.trendChart.data.datasets[0].backgroundColor = bgColor;
    state.trendChart.data.datasets[0].pointBackgroundColor = color;

    // 反转Y轴：名次高的在上方
    state.trendChart.options.scales.y.reverse = true;
    state.trendChart.options.scales.y.beginAtZero = false;
    state.trendChart.options.scales.y.max = undefined;
    state.trendChart.options.scales.y.title = {
        display: true,
        text: rankLabelPrefix + '（↑ 进步）',
        color: '#6b6560',
        font: { size: 12 }
    };
    state.trendChart.update();

    // 没有数据时显示提示
    const container = state.trendChart.canvas.parentElement;
    let hint = container.querySelector('.trend-empty-hint');
    if (data.length === 0) {
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'trend-empty-hint';
            container.appendChild(hint);
        }
        hint.innerHTML = `<div class="hint-icon">🏅</div><p>暂无排名数据<br>请在考试中填写排名信息</p>`;
        hint.style.display = '';
        state.trendChart.canvas.style.display = 'none';
    } else {
        if (hint) hint.style.display = 'none';
        state.trendChart.canvas.style.display = '';
    }
}

export function updateChartTabs() {
    const exams = getExams(getActiveProfileId(), true);
    const container = document.getElementById('chartTabs');
    const rankSelect = document.getElementById('rankTypeSelect');
    const subjects = [...new Set(exams.flatMap(e => (e.subjects || []).map(s => s.name)))];

    // 恢复分析模式UI
    const modeTabs = document.getElementById('analysisModeTabs');
    modeTabs.querySelectorAll('.chart-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.mode === state.trendAnalysisMode);
    });

    if (state.trendAnalysisMode === 'score') {
        // 分数模式：隐藏排名下拉，显示科目 tabs
        rankSelect.style.display = 'none';
        let html = '<button class="chart-tab active" data-chart="total">总分趋势</button>';
        subjects.forEach(subject => {
            html += `<button class="chart-tab" data-subject="${subject}" data-chart="subject">${subject}</button>`;
        });
        container.innerHTML = html;
    } else {
        // 排名模式：显示排名下拉，科目 tabs 只显示科目名
        rankSelect.style.display = '';
        rankSelect.value = state.trendRankType;
        let html = '<button class="chart-tab active" data-chart="total">总分</button>';
        subjects.forEach(subject => {
            html += `<button class="chart-tab" data-subject="${subject}" data-chart="subject">${subject}</button>`;
        });
        container.innerHTML = html;
    }

    // 绑定点击事件
    container.querySelectorAll('.chart-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            container.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            updateTrendChart();
        });
    });
}

export function updateChartsBySubject(subject) {
    const container = document.getElementById('chartTabs');
    container.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    const target = container.querySelector(`[data-subject="${subject}"]`);
    if (target) target.classList.add('active');
    updateTrendChart();
}
