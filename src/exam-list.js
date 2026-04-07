import state from './store.js';
import { getActiveProfileId, getExams } from './storage.js';
import { getDisplayTotalScore, escHtml } from './utils.js';
import { ENCOURAGEMENT_SCENES, leaveEncouragementScene } from './encouragement-copy.js';

let _renderExamDetail = null;
let _updateRadarChart = null;

export function setDependencies({ renderExamDetail, updateRadarChart }) {
    _renderExamDetail = renderExamDetail;
    _updateRadarChart = updateRadarChart;
}

export async function renderExamList() {
    const profileId = getActiveProfileId();
    const exams = getExams(profileId);
    const container = document.getElementById('examList');

    if (exams.length === 0) {
        container.innerHTML = '<div class="empty-state"><p style="font-size: 0.85rem;">暂无考试记录</p></div>';
        return;
    }

    const sortedExams = [...exams].sort(
        (a, b) => new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt)
    );

    container.innerHTML = sortedExams.map(exam => {
        const isExpanded = String(state.currentExamId) === String(exam.id);
        const subjects = exam.subjects || [];
        const totalScore = getDisplayTotalScore(exam);
        const isExcluded = !!exam.excluded;

        return `
            <div class="exam-folder ${isExcluded ? 'is-excluded' : ''} ${isExpanded ? 'expanded' : ''}" data-exam-id="${escHtml(exam.id)}">
                <div class="exam-folder-header ${isExpanded ? 'active' : ''}" data-role="select-exam" data-exam-id="${escHtml(exam.id)}">
                    <span class="folder-icon">▶</span>
                    <div class="exam-info">
                        <div class="exam-name">${escHtml(exam.name)}</div>
                        <div class="exam-date">${escHtml(exam.startDate || '未设置日期')} · ${totalScore}分</div>
                    </div>
                    <div class="exam-actions">
                        <button class="exam-action-btn exclude-btn ${isExcluded ? 'is-excluded' : ''}" data-role="toggle-exclude" data-exam-id="${escHtml(exam.id)}" title="${isExcluded ? '恢复计入统计' : '排除不计入统计'}">${isExcluded ? '🚫' : '📊'}</button>
                        <button class="exam-action-btn" data-role="edit-exam" data-exam-id="${escHtml(exam.id)}" title="编辑">✎</button>
                        <button class="exam-action-btn" data-role="delete-exam" data-exam-id="${escHtml(exam.id)}" title="删除">✕</button>
                    </div>
                </div>
                <div class="exam-subjects">
                    ${subjects.map(subject => {
                        const rankTag = subject.classRank ? ` · 班${subject.classRank}` : '';
                        return `
                            <div class="subject-item" data-role="select-exam" data-exam-id="${escHtml(exam.id)}">
                                <span class="subject-name">📚 ${escHtml(subject.name)}</span>
                                <span class="subject-score ${subject.score >= 90 ? 'good' : (subject.score >= 60 ? 'normal' : 'bad')}">${subject.score}${rankTag}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-role="select-exam"]').forEach(element => {
        element.addEventListener('click', () => selectExam(element.dataset.examId));
    });

    container.querySelectorAll('[data-role="toggle-exclude"]').forEach(element => {
        element.addEventListener('click', event => {
            event.stopPropagation();
            window.toggleExamExclude?.(element.dataset.examId);
        });
    });

    container.querySelectorAll('[data-role="edit-exam"]').forEach(element => {
        element.addEventListener('click', event => {
            event.stopPropagation();
            window.editExam?.(element.dataset.examId);
        });
    });

    container.querySelectorAll('[data-role="delete-exam"]').forEach(element => {
        element.addEventListener('click', event => {
            event.stopPropagation();
            window.deleteExam?.(element.dataset.examId);
        });
    });
}

export async function selectExam(examId) {
    if (String(state.currentExamId) === String(examId)) {
        state.currentExamId = null;
        state.detailEmptySceneKey = ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY;
        state.isEditingTotalScore = false;
        state.manualTotalDraft = '';
        await renderExamList();
        if (_renderExamDetail) _renderExamDetail();
        if (_updateRadarChart) _updateRadarChart();
        return;
    }

    leaveEncouragementScene(ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY);
    state.currentExamId = examId;
    state.detailEmptySceneKey = '';
    state.isEditingTotalScore = false;
    state.manualTotalDraft = '';
    await renderExamList();
    if (_renderExamDetail) _renderExamDetail();
    if (_updateRadarChart) _updateRadarChart();
}

export async function selectSubject(examId, subjectName) {
    leaveEncouragementScene(ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY);
    state.currentExamId = examId;
    state.detailEmptySceneKey = '';
    state.isEditingTotalScore = false;
    state.manualTotalDraft = '';
    await renderExamList();
    if (_renderExamDetail) _renderExamDetail();
}
