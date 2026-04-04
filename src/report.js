import state from './store.js';
import { getExams, getProfiles, getActiveProfileId } from './storage.js';
import { showToast } from './modal.js';
import { getDisplayTotalScore } from './utils.js';

// 打开分享考试报告
export function openShareExamReport() {
    const exams = getExams(getActiveProfileId());
    const exam = exams.find(e => e.id == state.currentExamId);
    if (!exam || !exam.subjects || exam.subjects.length === 0) {
        showToast({ icon: '⚠️', iconType: 'warning', title: '无法分享', message: '当前考试没有成绩数据' });
        return;
    }
    state._reportType = 'exam';
    state._reportData = exam;
    generateAndShowReport();
}

// 打开分享档案报告
export function openShareProfileReport(index) {
    const profiles = getProfiles();
    const p = profiles[index];
    if (!p) return;
    const exams = getExams(p.id);
    if (exams.length === 0) {
        showToast({ icon: '⚠️', iconType: 'warning', title: '无法分享', message: '该档案暂无考试记录' });
        return;
    }
    state._reportType = 'profile';
    state._reportData = { profile: p, exams: exams };
    generateAndShowReport();
}

// 生成报告并显示预览
export async function generateAndShowReport() {
    const overlay = document.getElementById('reportModalOverlay');
    const previewArea = document.getElementById('reportPreviewArea');
    overlay.classList.add('active');
    previewArea.innerHTML = '<p style="color: var(--text-secondary); padding: 40px 0;">正在生成报告...</p>';

    const wrapper = document.getElementById('report-render-wrapper');
    let reportHTML = '';

    if (state._reportType === 'exam') {
        reportHTML = buildExamReportHTML(state._reportData);
    } else {
        reportHTML = buildProfileReportHTML(state._reportData);
    }
    wrapper.innerHTML = reportHTML;

    // 等待字体和图片加载
    await new Promise(r => setTimeout(r, 300));

    try {
        const canvas = await html2canvas(wrapper.firstElementChild, {
            scale: 2,
            useCORS: true,
            backgroundColor: null,
            logging: false
        });
        previewArea.innerHTML = '';
        const img = canvas.toDataURL('image/png');
        previewArea.innerHTML = `<img src="${img}" alt="成绩报告">`;
    } catch (err) {
        previewArea.innerHTML = '<p style="color: #e74c3c;">报告生成失败，请重试</p>';
        console.error('html2canvas error:', err);
    }
}

// 关闭报告弹窗
export function closeShareReport() {
    document.getElementById('reportModalOverlay').classList.remove('active');
    document.getElementById('report-render-wrapper').innerHTML = '';
    state._reportType = '';
    state._reportData = null;
}

// 下载报告图片
export function downloadReport() {
    const img = document.querySelector('#reportPreviewArea img');
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.src;
    const dateStr = new Date().toISOString().slice(0, 10);
    const name = state._reportType === 'exam'
        ? `考试报告_${(state._reportData.name || '').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '')}_${dateStr}`
        : `档案报告_${(state._reportData.profile.name || '').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '')}_${dateStr}`;
    a.download = name + '.png';
    a.click();
}

// 构建单场考试报告卡片 HTML
function buildExamReportHTML(exam) {
    const subjects = exam.subjects || [];
    const totalScore = getDisplayTotalScore(exam);
    const totalFull = subjects.reduce((sum, s) => sum + (s.fullScore || 0), 0);
    const avgPct = totalFull > 0 ? (totalScore / totalFull * 100).toFixed(1) : '--';

    let rankHTML = '';
    if (exam.totalClassRank) {
        const pct = exam.classTotal ? `${(exam.totalClassRank / exam.classTotal * 100).toFixed(1)}%` : '';
        rankHTML += `<div class="rep-rank-item"><span class="rep-rank-label">班级排名</span><span class="rep-rank-value">第${exam.totalClassRank}名${pct ? ' (前' + pct + ')' : ''}</span></div>`;
    }
    if (exam.totalGradeRank) {
        const pct = exam.gradeTotal ? `${(exam.totalGradeRank / exam.gradeTotal * 100).toFixed(1)}%` : '';
        rankHTML += `<div class="rep-rank-item"><span class="rep-rank-label">年级排名</span><span class="rep-rank-value">第${exam.totalGradeRank}名${pct ? ' (前' + pct + ')' : ''}</span></div>`;
    }

    const subjectRows = subjects.map(s => {
        const pct = s.fullScore > 0 ? (s.score / s.fullScore * 100).toFixed(1) : '--';
        const level = s.score >= 90 ? 'rep-good' : (s.score >= 60 ? 'rep-normal' : 'rep-bad');
        let rankTag = '';
        if (s.classRank) rankTag += `<span class="rep-subj-rank">班${s.classRank}</span>`;
        if (s.gradeRank) rankTag += `<span class="rep-subj-rank">校${s.gradeRank}</span>`;
        return `<div class="rep-subject-row">
            <div class="rep-subj-name">${s.name}</div>
            <div class="rep-subj-score ${level}">${s.score}<small>/${s.fullScore}</small></div>
            <div class="rep-subj-pct">${pct}%</div>
            <div class="rep-subj-ranks">${rankTag}</div>
        </div>`;
    }).join('');

    const profiles = getProfiles();
    const activeProfile = profiles.find(p => p.id === getActiveProfileId());
    const profileName = activeProfile ? activeProfile.name : '';

    return `<div class="rep-card">
        <div class="rep-header">
            <div class="rep-header-bg"></div>
            <div class="rep-header-content">
                <div class="rep-brand">📊 成绩管家</div>
                <div class="rep-exam-name">${exam.name}</div>
                ${profileName ? `<div class="rep-profile-name">${profileName}</div>` : ''}
            </div>
        </div>
        <div class="rep-body">
            <div class="rep-total-row">
                <div class="rep-total-item">
                    <div class="rep-total-num">${totalScore}</div>
                    <div class="rep-total-label">总分</div>
                </div>
                <div class="rep-total-item">
                    <div class="rep-total-num">${totalFull}</div>
                    <div class="rep-total-label">满分</div>
                </div>
                <div class="rep-total-item">
                    <div class="rep-total-num">${avgPct}%</div>
                    <div class="rep-total-label">得分率</div>
                </div>
                <div class="rep-total-item">
                    <div class="rep-total-num">${subjects.length}</div>
                    <div class="rep-total-label">科目</div>
                </div>
            </div>
            ${rankHTML ? `<div class="rep-rank-section">${rankHTML}</div>` : ''}
            <div class="rep-subjects">${subjectRows}</div>
            ${exam.startDate ? `<div class="rep-date">📅 ${exam.startDate}${exam.endDate && exam.endDate !== exam.startDate ? ' ~ ' + exam.endDate : ''}</div>` : ''}
        </div>
        <div class="rep-footer">由「成绩管家」生成 · 记录每一步进步</div>
    </div>
    <style>
        .rep-card { width: 360px; background: #fff; border-radius: 16px; overflow: hidden; font-family: 'Noto Sans SC', -apple-system, sans-serif; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
        .rep-header { position: relative; padding: 28px 24px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; overflow: hidden; }
        .rep-header-bg { position: absolute; top: -30px; right: -30px; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.1); }
        .rep-header-content { position: relative; z-index: 1; }
        .rep-brand { font-size: 0.75rem; opacity: 0.8; margin-bottom: 8px; letter-spacing: 1px; }
        .rep-exam-name { font-size: 1.3rem; font-weight: 600; margin-bottom: 4px; }
        .rep-profile-name { font-size: 0.85rem; opacity: 0.85; }
        .rep-body { padding: 20px 24px; }
        .rep-total-row { display: flex; justify-content: space-around; margin-bottom: 20px; padding: 16px 0; background: #f8f7fc; border-radius: 12px; }
        .rep-total-item { text-align: center; }
        .rep-total-num { font-size: 1.5rem; font-weight: 600; color: #667eea; }
        .rep-total-label { font-size: 0.75rem; color: #999; margin-top: 2px; }
        .rep-rank-section { display: flex; gap: 16px; margin-bottom: 20px; padding: 12px 16px; background: #fef9f0; border-radius: 10px; border-left: 3px solid #f0a040; }
        .rep-rank-item { flex: 1; }
        .rep-rank-label { font-size: 0.7rem; color: #999; display: block; margin-bottom: 2px; }
        .rep-rank-value { font-size: 0.9rem; font-weight: 500; color: #d4850a; }
        .rep-subjects { margin-bottom: 16px; }
        .rep-subject-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #f0eeea; }
        .rep-subject-row:last-child { border-bottom: none; }
        .rep-subject-name { width: 60px; font-size: 0.9rem; font-weight: 500; color: #333; }
        .rep-subject-score { flex: 1; font-size: 1.1rem; font-weight: 600; }
        .rep-subject-score small { font-size: 0.75rem; font-weight: 400; color: #999; }
        .rep-good { color: #52c41a; }
        .rep-normal { color: #333; }
        .rep-bad { color: #f5222d; }
        .rep-subj-pct { width: 50px; font-size: 0.8rem; color: #888; text-align: right; }
        .rep-subj-ranks { width: 80px; text-align: right; }
        .rep-subj-rank { display: inline-block; font-size: 0.7rem; background: #f0f5ff; color: #4a7cc9; padding: 1px 6px; border-radius: 8px; margin-left: 4px; }
        .rep-date { font-size: 0.8rem; color: #aaa; margin-bottom: 8px; }
        .rep-footer { text-align: center; padding: 12px; font-size: 0.7rem; color: #ccc; border-top: 1px solid #f0eeea; }
    </style>`;
}

// 构建档案报告卡片 HTML
function buildProfileReportHTML(data) {
    const { profile, exams } = data;
    const sorted = [...exams].sort((a, b) => new Date(a.startDate || a.createdAt) - new Date(b.startDate || b.createdAt));
    const allSubjectNames = [...new Set(sorted.flatMap(e => (e.subjects || []).map(s => s.name)))];

    const latest = sorted[sorted.length - 1];
    const latestSubjects = latest ? latest.subjects || [] : [];
    const latestTotal = latest ? getDisplayTotalScore(latest) : 0;
    const latestFull = latestSubjects.reduce((sum, s) => sum + (s.fullScore || 0), 0);
    const latestPct = latestFull > 0 ? (latestTotal / latestFull * 100).toFixed(1) : '--';

    let latestRankHTML = '';
    if (latest && latest.totalClassRank) {
        const pct = latest.classTotal ? `${(latest.totalClassRank / latest.classTotal * 100).toFixed(1)}%` : '';
        latestRankHTML += `<span class="rep-subj-rank">班第${latest.totalClassRank}名${pct ? '(前' + pct + ')' : ''}</span>`;
    }

    const recentExams = sorted.slice(-5);
    const trendHTML = recentExams.map((e, i) => {
        const total = getDisplayTotalScore(e);
        const full = (e.subjects || []).reduce((sum, s) => sum + (s.fullScore || 0), 0);
        const pct = full > 0 ? (total / full * 100).toFixed(1) : 0;
        const barHeight = Math.max(8, pct * 0.7);
        const isLast = i === recentExams.length - 1;
        return `<div class="rep-trend-col" style="text-align:center;">
            <div class="rep-trend-bar" style="height:${barHeight}px;${isLast ? 'background:linear-gradient(180deg,#11998e,#38ef7d);' : 'background:#e0f5ef;'}"></div>
            <div class="rep-trend-pct" style="${isLast ? 'color:#11998e;font-weight:600;' : ''}">${pct}%</div>
            <div class="rep-trend-name">${e.name.length > 4 ? e.name.slice(-4) : e.name}</div>
        </div>`;
    }).join('');

    const subjOverview = allSubjectNames.slice(0, 8).map(name => {
        const s = latestSubjects.find(s => s.name === name);
        if (!s) return '';
        const pct = s.fullScore > 0 ? (s.score / s.fullScore * 100).toFixed(0) : 0;
        const level = s.score >= 90 ? '#52c41a' : (s.score >= 60 ? '#11998e' : '#f5222d');
        return `<div class="rep-overview-subj">
            <div class="rep-ov-ring" style="background:conic-gradient(${level} ${pct * 3.6}deg,#f0eeea 0deg);">
                <div class="rep-ov-ring-inner">${pct}</div>
            </div>
            <div class="rep-ov-name">${name}</div>
        </div>`;
    }).join('');

    return `<div class="rep-card">
        <div class="rep-header">
            <div class="rep-header-bg"></div>
            <div class="rep-header-content">
                <div class="rep-brand">📊 成绩管家 · 档案报告</div>
                <div class="rep-exam-name">${profile.name}</div>
                <div class="rep-profile-name">共 ${sorted.length} 次考试 · ${allSubjectNames.length} 个科目</div>
            </div>
        </div>
        <div class="rep-body">
            <div class="rep-total-row">
                <div class="rep-total-item">
                    <div class="rep-total-num">${latestTotal}</div>
                    <div class="rep-total-label">最新总分</div>
                </div>
                <div class="rep-total-item">
                    <div class="rep-total-num">${latestPct}%</div>
                    <div class="rep-total-label">得分率</div>
                </div>
                <div class="rep-total-item">
                    <div class="rep-total-num">${allSubjectNames.length}</div>
                    <div class="rep-total-label">科目</div>
                </div>
                <div class="rep-total-item">
                    <div class="rep-total-num">${sorted.length}</div>
                    <div class="rep-total-label">考试次数</div>
                </div>
            </div>
            ${latestRankHTML ? `<div class="rep-rank-section" style="text-align:center;"><span class="rep-rank-value" style="font-size:1rem;">${latestRankHTML}</span></div>` : ''}
            <div class="rep-section-title">📈 得分率趋势（最近${recentExams.length}次）</div>
            <div class="rep-trend-section">${trendHTML}</div>
            ${subjOverview ? `<div class="rep-section-title">📚 最新各科概况</div><div class="rep-overview-grid">${subjOverview}</div>` : ''}
        </div>
        <div class="rep-footer">由「成绩管家」生成 · 记录每一步进步</div>
    </div>
    <style>
        .rep-card { width: 380px; background: #fff; border-radius: 16px; overflow: hidden; font-family: 'Noto Sans SC', -apple-system, sans-serif; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
        .rep-header { position: relative; padding: 28px 24px 20px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: #fff; overflow: hidden; }
        .rep-header-bg { position: absolute; top: -30px; right: -30px; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.1); }
        .rep-header-content { position: relative; z-index: 1; }
        .rep-brand { font-size: 0.75rem; opacity: 0.8; margin-bottom: 8px; letter-spacing: 1px; }
        .rep-exam-name { font-size: 1.3rem; font-weight: 600; margin-bottom: 4px; }
        .rep-profile-name { font-size: 0.85rem; opacity: 0.85; }
        .rep-body { padding: 20px 24px; }
        .rep-total-row { display: flex; justify-content: space-around; margin-bottom: 20px; padding: 16px 0; background: #f5faf8; border-radius: 12px; }
        .rep-total-item { text-align: center; }
        .rep-total-num { font-size: 1.5rem; font-weight: 600; color: #11998e; }
        .rep-total-label { font-size: 0.75rem; color: #999; margin-top: 2px; }
        .rep-rank-section { display: flex; gap: 16px; margin-bottom: 20px; padding: 12px 16px; background: #fef9f0; border-radius: 10px; border-left: 3px solid #f0a040; }
        .rep-rank-value { font-size: 0.9rem; font-weight: 500; color: #d4850a; }
        .rep-section-title { font-size: 0.9rem; font-weight: 500; color: #333; margin: 18px 0 12px; padding-left: 8px; border-left: 3px solid #11998e; }
        .rep-trend-section { display: flex; justify-content: space-around; align-items: flex-end; height: 130px; padding: 10px 0; background: #fafafa; border-radius: 12px; }
        .rep-trend-col { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 50px; }
        .rep-trend-bar { width: 28px; border-radius: 6px 6px 0 0; min-height: 8px; }
        .rep-trend-pct { font-size: 0.75rem; color: #999; }
        .rep-trend-name { font-size: 0.6rem; color: #bbb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50px; }
        .rep-overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        .rep-overview-subj { text-align: center; }
        .rep-ov-ring { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 4px; }
        .rep-ov-ring-inner { width: 38px; height: 38px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; color: #333; }
        .rep-ov-name { font-size: 0.7rem; color: #888; }
        .rep-subj-rank { display: inline-block; font-size: 0.7rem; background: #f0f5ff; color: #4a7cc9; padding: 1px 6px; border-radius: 8px; }
        .rep-footer { text-align: center; padding: 12px; font-size: 0.7rem; color: #ccc; border-top: 1px solid #f0eeea; }
    </style>`;
}

export function setupReportEvents() {
    // 点击遮罩关闭报告弹窗
    document.getElementById('reportModalOverlay').addEventListener('click', function(e) {
        if (e.target === this) closeShareReport();
    });
}
