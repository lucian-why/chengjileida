import state from './store.js';
import { getExams, getActiveProfileId } from './storage.js';
import { saveTrendMode } from './utils.js';
import { CHART_COLORS } from './chart-trend.js';
import { RADAR_COMPARE_STYLES } from './chart-radar.js';

export function openChartZoom(type) {
    const overlay = document.getElementById('chartZoomOverlay');
    const body = document.getElementById('chartZoomBody');
    const titleEl = document.getElementById('chartZoomTitle');
    const zoomTabsEl = document.getElementById('zoomChartTabs');
    const zoomRankSelect = document.getElementById('zoomRankTypeSelect');
    const zoomTrendContainer = body.querySelector('.chart-container');
    const zoomRadarContainer = document.getElementById('zoomRadarContainer');
    const zoomTrendCanvas = document.getElementById('zoomTrendChart');
    const zoomRadarCanvas = document.getElementById('zoomRadarChart');

    if (type === 'trend') {
        titleEl.textContent = state.trendAnalysisMode === 'rank' ? '🏅 排名趋势' : '📊 分数趋势';
        zoomTrendContainer.style.display = '';
        zoomRadarContainer.style.display = 'none';
        zoomTabsEl.style.display = '';
        zoomRankSelect.style.display = state.trendAnalysisMode === 'rank' ? '' : 'none';
        zoomRankSelect.value = state.trendRankType;

        // 复制科目 tabs
        const exams = getExams(getActiveProfileId(), true);
        const subjects = [...new Set(exams.flatMap(e => (e.subjects || []).map(s => s.name)))];
        const activeTab = document.querySelector('#chartTabs .chart-tab.active');
        const selectedSubject = activeTab ? activeTab.dataset.subject : null;

        let tabsHtml = '<button class="chart-tab active" data-chart="total">总分</button>';
        subjects.forEach(s => {
            tabsHtml += `<button class="chart-tab ${selectedSubject === s ? 'active' : ''}" data-subject="${s}" data-chart="subject">${s}</button>`;
        });
        zoomTabsEl.innerHTML = tabsHtml;
        // 调整 active 状态
        if (selectedSubject) {
            zoomTabsEl.querySelectorAll('.chart-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.subject === selectedSubject || (!t.dataset.subject && !selectedSubject));
            });
        }

        // 销毁旧图表
        if (state.zoomTrendChart) { state.zoomTrendChart.destroy(); state.zoomTrendChart = null; }
        state.zoomTrendChart = new Chart(zoomTrendCanvas, {
            type: 'line',
            data: { labels: [], datasets: [{ data: [], borderWidth: 2, pointRadius: 5, pointHoverRadius: 7, tension: 0.3, fill: false }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + ctx.parsed.y;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' } },
                    y: { beginAtZero: false, grid: { color: 'rgba(128,128,128,0.1)' } }
                }
            }
        });

        // 渲染数据
        const sortedExams = [...exams].sort((a, b) => new Date(a.startDate || a.createdAt) - new Date(b.startDate || b.createdAt));
        if (state.trendAnalysisMode === 'rank') {
            renderZoomRankChart(sortedExams);
        } else {
            renderZoomScoreChart(sortedExams);
        }

        // 绑定 tab 切换
        zoomTabsEl.querySelectorAll('.chart-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                zoomTabsEl.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                if (state.trendAnalysisMode === 'rank') {
                    renderZoomRankChart(sortedExams);
                } else {
                    renderZoomScoreChart(sortedExams);
                }
            });
        });

        // 绑定排名类型切换
        zoomRankSelect.onchange = function() {
            state.trendRankType = this.value;
            saveTrendMode();
            document.getElementById('rankTypeSelect').value = state.trendRankType;
            // updateTrendChart and updateCharts are in chart-trend.js, use direct import
            import('./chart-trend.js').then(m => m.updateTrendChart());
            renderZoomRankChart(sortedExams);
        };

    } else if (type === 'radar') {
        titleEl.textContent = '🎯 科目对比';
        zoomTrendContainer.style.display = 'none';
        zoomRadarContainer.style.display = '';
        zoomTabsEl.style.display = 'none';
        zoomRankSelect.style.display = 'none';

        // 销毁旧图表
        if (state.zoomRadarChart) { state.zoomRadarChart.destroy(); state.zoomRadarChart = null; }

        const exams = getExams(getActiveProfileId(), true);
        const currentExam = exams.find(e => e.id === state.currentExamId);
        if (!currentExam || !currentExam.subjects || currentExam.subjects.length < 3) return;

        const currentSubjects = currentExam.subjects.filter(s => s.fullScore && s.fullScore > 0);
        if (currentSubjects.length < 3) return;

        const labels = currentSubjects.map(s => s.name);
        const currentData = currentSubjects.map(s => Math.round(s.score / s.fullScore * 100));

        const datasets = [{
            label: currentExam.name,
            data: currentData,
            backgroundColor: 'rgba(232, 100, 60, 0.15)',
            borderColor: '#E8643C',
            borderWidth: 3,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointStyle: 'circle',
            fill: true
        }];

        // 添加对比考试
        state.selectedCompareIds.forEach((id, ci) => {
            const compareExam = exams.find(e => e.id === id);
            if (!compareExam) return;
            const style = RADAR_COMPARE_STYLES[ci % RADAR_COMPARE_STYLES.length];
            const compareSubjects = compareExam.subjects.filter(s => s.fullScore && s.fullScore > 0);
            const data = labels.map(name => {
                const s = compareSubjects.find(cs => cs.name === name);
                return s ? Math.round(s.score / s.fullScore * 100) : null;
            });
            datasets.push({
                label: compareExam.name,
                data: data,
                backgroundColor: style.bg,
                borderColor: style.border,
                borderWidth: style.borderWidth,
                pointRadius: style.pointRadius,
                pointHoverRadius: style.pointHoverRadius,
                pointStyle: style.pointStyle,
                fill: style.fill
            });
        });

        state.zoomRadarChart = new Chart(zoomRadarCanvas, {
            type: 'radar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: { display: datasets.length > 1, position: 'bottom', labels: { padding: 20, usePointStyle: true, font: { size: 14 } } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + ctx.parsed.r + '%';
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { stepSize: 20, font: { size: 14 }, color: 'var(--text-secondary)', backdropColor: 'transparent' },
                        pointLabels: { font: { size: 16, weight: '500' }, color: 'var(--text-primary)' },
                        grid: { color: 'rgba(128,128,128,0.15)' },
                        angleLines: { color: 'rgba(128,128,128,0.15)' }
                    }
                }
            }
        });
    }

    overlay.classList.add('active');
}

function renderZoomScoreChart(sortedExams) {
    if (!state.zoomTrendChart) return;
    const activeTab = document.querySelector('#zoomChartTabs .chart-tab.active');
    const selectedSubject = activeTab ? activeTab.dataset.subject : null;

    let data, label;
    if (!selectedSubject || activeTab.dataset.chart === 'total') {
        data = sortedExams.map(exam => {
            const subjects = exam.subjects || [];
            if (subjects.length === 0) return null;
            const total = subjects.reduce((sum, s) => sum + s.score, 0);
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

    state.zoomTrendChart.data.labels = data.map(e => e.name);
    state.zoomTrendChart.data.datasets[0].data = data.map(e => e.value);
    state.zoomTrendChart.data.datasets[0].label = label;
    state.zoomTrendChart.data.datasets[0].borderColor = CHART_COLORS.accent;
    state.zoomTrendChart.data.datasets[0].backgroundColor = CHART_COLORS.accentBg;
    state.zoomTrendChart.data.datasets[0].pointBackgroundColor = CHART_COLORS.accent;
    state.zoomTrendChart.options.scales.y.reverse = false;
    state.zoomTrendChart.options.scales.y.beginAtZero = false;
    state.zoomTrendChart.options.scales.y.max = undefined;
    state.zoomTrendChart.options.scales.y.title = { display: false };
    state.zoomTrendChart.update();
}

function renderZoomRankChart(sortedExams) {
    if (!state.zoomTrendChart) return;
    const activeTab = document.querySelector('#zoomChartTabs .chart-tab.active');
    const selectedSubject = activeTab ? activeTab.dataset.subject : null;

    let data, label, rankLabelPrefix;
    if (!selectedSubject || activeTab.dataset.chart === 'total') {
        data = sortedExams.map(exam => {
            const rank = state.trendRankType === 'class' ? exam.totalClassRank : exam.totalGradeRank;
            return rank ? { name: exam.name, value: rank } : null;
        }).filter(e => e !== null);
        rankLabelPrefix = state.trendRankType === 'class' ? '班级排名' : '年级排名';
        label = '总分' + rankLabelPrefix;
    } else {
        data = sortedExams.map(exam => {
            const record = (exam.subjects || []).find(s => s.name === selectedSubject);
            if (!record) return null;
            const rank = state.trendRankType === 'class' ? record.classRank : record.gradeRank;
            return rank ? { name: exam.name, value: rank } : null;
        }).filter(e => e !== null);
        rankLabelPrefix = state.trendRankType === 'class' ? '班级' : '年级';
        label = selectedSubject + rankLabelPrefix + '排名';
    }

    const color = state.trendRankType === 'class' ? CHART_COLORS.blue : CHART_COLORS.purple;
    const bgColor = state.trendRankType === 'class' ? CHART_COLORS.blueBg : CHART_COLORS.purpleBg;

    state.zoomTrendChart.data.labels = data.map(e => e.name);
    state.zoomTrendChart.data.datasets[0].data = data.map(e => e.value);
    state.zoomTrendChart.data.datasets[0].label = label;
    state.zoomTrendChart.data.datasets[0].borderColor = color;
    state.zoomTrendChart.data.datasets[0].backgroundColor = bgColor;
    state.zoomTrendChart.data.datasets[0].pointBackgroundColor = color;
    state.zoomTrendChart.options.scales.y.reverse = true;
    state.zoomTrendChart.options.scales.y.beginAtZero = true;
    state.zoomTrendChart.options.scales.y.max = undefined;
    state.zoomTrendChart.options.scales.y.title = {
        display: true,
        text: rankLabelPrefix + '（↑ 进步）',
        color: '#6b6560',
        font: { size: 12 }
    };
    state.zoomTrendChart.update();
}

export function closeChartZoom() {
    const overlay = document.getElementById('chartZoomOverlay');
    overlay.classList.remove('active');
    if (state.zoomTrendChart) { state.zoomTrendChart.destroy(); state.zoomTrendChart = null; }
    if (state.zoomRadarChart) { state.zoomRadarChart.destroy(); state.zoomRadarChart = null; }
}
