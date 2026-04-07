import state from './store.js';
import {
    getExams,
    getExamsAll,
    getActiveProfileId,
    saveExams,
    rememberExamDefaults,
    getRememberedExamDefaults,
    rememberSubjectFullScore,
    getRememberedSubjectFullScore
} from './storage.js';
import { showToast } from './modal.js';
import { updateScoreMax, getDisplayTotalScore, hasManualTotalMismatch } from './utils.js';
import { ENCOURAGEMENT_SCENES, renderCollapsedEmptyEncouragement, leaveEncouragementScene } from './encouragement-copy.js';

let _refreshAll = null;

export function setDependencies({ refreshAll }) {
    _refreshAll = refreshAll;
}

function addDays(dateString, days) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

function applyAutoEndDate() {
    const form = document.getElementById('examForm');
    if (form.dataset.examId) return;

    const startInput = document.getElementById('examStartDate');
    const endInput = document.getElementById('examEndDate');
    const nextDay = addDays(startInput.value, 1);
    if (!nextDay) return;

    const lastAutoValue = endInput.dataset.autoValue || '';
    const shouldAutoFill = !endInput.value || endInput.value === lastAutoValue;
    if (!shouldAutoFill) return;

    endInput.value = nextDay;
    endInput.dataset.autoValue = nextDay;
}

function applyRememberedSubjectFullScore() {
    const profileId = getActiveProfileId();
    const subjectInput = document.getElementById('subjectName');
    const scoreFullInput = document.getElementById('scoreFull');
    const rememberedFullScore = getRememberedSubjectFullScore(profileId, subjectInput.value);

    if (!rememberedFullScore) return;

    const lastAutoValue = scoreFullInput.dataset.autoValue || '';
    const shouldAutoFill =
        !scoreFullInput.value ||
        scoreFullInput.value === '100' ||
        scoreFullInput.value === lastAutoValue;

    if (!shouldAutoFill) return;

    scoreFullInput.value = rememberedFullScore;
    scoreFullInput.dataset.autoValue = String(rememberedFullScore);
    updateScoreMax();
}

export async function renderExamDetail() {
    const exams = getExams(getActiveProfileId());
    const container = document.getElementById('examContent');

    if (!state.currentExamId) {
        if (exams.length === 0) {
            state.detailEmptySceneKey = '';
            leaveEncouragementScene(ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <p>选择一场考试查看详情<br>或新建一场考试</p>
                </div>
            `;
            return;
        }

        if (state.detailEmptySceneKey === ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY) {
            await renderCollapsedEmptyEncouragement(container, {
                pageKey: 'exam_detail',
                profileId: getActiveProfileId(),
                examCount: exams.length
            });
            return;
        }

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <p>选择一场考试查看详情<br>或新建一场考试</p>
            </div>
        `;
        return;
    }

    const exam = exams.find(item => String(item.id) === String(state.currentExamId));
    if (!exam) {
        container.innerHTML = '<div class="empty-state"><p>考试不存在</p></div>';
        return;
    }

    const subjects = exam.subjects || [];
    const totalScore = getDisplayTotalScore(exam);
    const totalMismatch = hasManualTotalMismatch(exam);
    const totalRankTags = [];

    if (exam.totalClassRank) totalRankTags.push(`班级第${exam.totalClassRank}`);
    if (exam.totalGradeRank) totalRankTags.push(`年级第${exam.totalGradeRank}`);

    const totalCardContent = state.isEditingTotalScore
        ? `
            <div class="inline-total-score-editor">
                ${totalMismatch ? `<button type="button" class="total-score-alert-btn" onclick="confirmRestoreAutoTotalScore()" title="恢复为各科自动计算的总分">!</button>` : ''}
                <input id="manualTotalScoreInput" class="inline-total-score-input" type="number" inputmode="numeric" value="${state.manualTotalDraft || totalScore}" oninput="onManualTotalScoreInput(this.value)" onblur="handleManualTotalScoreBlur()" onkeydown="handleManualTotalScoreKeydown(event)" autofocus>
                <button type="button" class="inline-total-score-save" onclick="saveInlineTotalScore()">保存</button>
                <button type="button" class="inline-total-score-cancel" onmousedown="prepareCancelInlineTotalScore()" onclick="cancelInlineTotalScore()">取消</button>
            </div>
        `
        : `
            <div class="inline-total-score-wrap">
                ${totalMismatch ? `<button type="button" class="total-score-alert-btn" onclick="event.stopPropagation(); confirmRestoreAutoTotalScore()" title="恢复为各科自动计算的总分">!</button>` : ''}
                <button type="button" class="inline-total-score-trigger" onclick="startEditTotalScore()">${totalScore}</button>
            </div>
        `;

    container.innerHTML = `
        <div class="exam-overview">
            <div class="overview-card">
                <div class="label">考试名称</div>
                <div class="value">${exam.name}</div>
            </div>
            <div class="overview-card">
                <div class="label">总分</div>
                <div class="value highlight total-score-card-value">${totalCardContent}</div>
                ${totalRankTags.length > 0 ? `<div class="overview-rank-tags">${totalRankTags.map(tag => `<span class="rank-tag">${tag}</span>`).join('')}</div>` : ''}
            </div>
        </div>

        <div style="margin-bottom: 16px;"><button class="share-report-btn" onclick="openShareExamReport()">📤 分享考试报告</button></div>

        ${exam.startDate ? `<p style="color: var(--text-secondary); margin-bottom: 20px;">📅 ${exam.startDate}${exam.endDate && exam.endDate !== exam.startDate ? ' ~ ' + exam.endDate : ''}</p>` : ''}
        ${exam.notes ? `<p style="color: var(--text-secondary); margin-bottom: 20px; font-style: italic;">${exam.notes}</p>` : ''}

        <div class="card">
            <div class="card-title-row">
                <h2 class="card-title" style="margin-bottom:0;">各科成绩</h2>
                <button class="batch-inline-btn" onclick="openBatchModal()">📝 批量填写</button>
            </div>
            <div class="subject-cards">
                ${subjects.map((subject, index) => {
                    let rankHtml = '';
                    if (subject.classRank) rankHtml += `<span class="rank-tag">班级第${subject.classRank}</span>`;
                    if (subject.gradeRank) rankHtml += `<span class="rank-tag">年级第${subject.gradeRank}</span>`;
                    return `
                        <div class="subject-card">
                            <button class="subject-del-btn" onclick="event.stopPropagation(); deleteSubjectScore(${index})" title="删除该科目">×</button>
                            <div class="subject-card-inner" onclick="editSubjectScore(${index})">
                                <div class="name">${subject.name}</div>
                                <div class="score ${subject.score >= 90 ? 'good' : (subject.score >= 60 ? 'normal' : 'bad')}">${subject.score}</div>
                                ${rankHtml ? `<div class="rank-info">${rankHtml}</div>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
                <div class="add-subject-btn" onclick="openScoreModal()">
                    <span style="font-size: 1.5rem;">+</span>
                    <span>添加成绩</span>
                </div>
            </div>
        </div>
    `;
}

export function startEditTotalScore() {
    const exams = getExams(getActiveProfileId());
    const exam = exams.find(item => String(item.id) === String(state.currentExamId));
    if (!exam) return;

    state.isEditingTotalScore = true;
    state.manualTotalDraft = String(getDisplayTotalScore(exam));

    renderExamDetail().then(() => {
        const input = document.getElementById('manualTotalScoreInput');
        if (input) {
            input.focus();
            input.select();
        }
    });
}

export function onManualTotalScoreInput(value) {
    state.manualTotalDraft = value;
}

export function prepareCancelInlineTotalScore() {
    state._skipTotalBlurSave = true;
}

export function cancelInlineTotalScore() {
    state._skipTotalBlurSave = false;
    state.isEditingTotalScore = false;
    state.manualTotalDraft = '';
    renderExamDetail();
}

export async function saveInlineTotalScore() {
    const allExams = getExamsAll();
    const examIndex = allExams.findIndex(exam => String(exam.id) === String(state.currentExamId));
    if (examIndex === -1) {
        cancelInlineTotalScore();
        return;
    }

    const rawValue = String(state.manualTotalDraft || '').trim();
    if (!rawValue) {
        delete allExams[examIndex].manualTotalScore;
    } else {
        const total = Number(rawValue);
        if (Number.isNaN(total)) {
            showToast({ icon: '⚠️', iconType: 'warning', title: '输入有误', message: '请输入有效总分' });
            return;
        }
        allExams[examIndex].manualTotalScore = total;
    }

    saveExams(allExams);
    state.isEditingTotalScore = false;
    state.manualTotalDraft = '';
    if (_refreshAll) await _refreshAll();
    showToast({ icon: '✅', iconType: 'success', title: '已保存', message: '总分已更新' });
}

export function handleManualTotalScoreBlur() {
    if (!state.isEditingTotalScore) return;
    if (state._skipTotalBlurSave) {
        state._skipTotalBlurSave = false;
        return;
    }
    saveInlineTotalScore();
}

export function handleManualTotalScoreKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        saveInlineTotalScore();
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        cancelInlineTotalScore();
    }
}

export function confirmRestoreAutoTotalScore() {
    const exams = getExams(getActiveProfileId());
    const exam = exams.find(item => String(item.id) === String(state.currentExamId));
    if (!exam || !hasManualTotalMismatch(exam)) return;

    document.getElementById('confirmModalTitle').textContent = '鎭㈠鑷姩总分';
    document.getElementById('confirmModalMessage').textContent = '确定按各科成绩重新计算总分吗？当前手动修改的总分将被清除。';
    state._confirmCallback = async () => {
        const allExams = getExamsAll();
        const examIndex = allExams.findIndex(item => String(item.id) === String(state.currentExamId));
        if (examIndex === -1) return;
        delete allExams[examIndex].manualTotalScore;
        saveExams(allExams);
        state.isEditingTotalScore = false;
        state.manualTotalDraft = '';
        if (_refreshAll) await _refreshAll();
        showToast({ icon: '✅', iconType: 'success', title: '已恢复', message: '总分已恢复为自动计算' });
    };
    document.getElementById('confirmModal').classList.add('active');
}

export async function openExamModal(examId = null) {
    const modal = document.getElementById('examModal');
    const form = document.getElementById('examForm');
    const title = document.getElementById('examModalTitle');
    const startDateInput = document.getElementById('examStartDate');
    const endDateInput = document.getElementById('examEndDate');
    const classTotalInput = document.getElementById('examClassTotal');
    const gradeTotalInput = document.getElementById('examGradeTotal');

    form.reset();

    if (examId) {
        const exams = getExams(getActiveProfileId());
        const exam = exams.find(item => item.id === examId);
        if (exam) {
            title.textContent = '编辑考试';
            document.getElementById('examName').value = exam.name;
            startDateInput.value = exam.startDate || '';
            endDateInput.value = exam.endDate || '';
            endDateInput.dataset.autoValue = '';
            document.getElementById('examNotes').value = exam.notes || '';
            classTotalInput.value = exam.classTotal || '';
            gradeTotalInput.value = exam.gradeTotal || '';
            document.getElementById('examTotalClassRank').value = exam.totalClassRank || '';
            document.getElementById('examTotalGradeRank').value = exam.totalGradeRank || '';
            form.dataset.examId = examId;
        }
    } else {
        const rememberedDefaults = getRememberedExamDefaults(getActiveProfileId());
        title.textContent = '新建考试';
        startDateInput.value = new Date().toISOString().split('T')[0];
        endDateInput.value = addDays(startDateInput.value, 1);
        endDateInput.dataset.autoValue = endDateInput.value;
        classTotalInput.value = rememberedDefaults.classTotal || '';
        gradeTotalInput.value = rememberedDefaults.gradeTotal || '';
        delete form.dataset.examId;
    }

    modal.classList.add('active');
}

export function closeExamModal() {
    document.getElementById('examModal').classList.remove('active');
}

export function openScoreModal() {
    if (!state.currentExamId) {
        showToast({ icon: '📌', iconType: 'info', title: '提示', message: '请先选择一场考试' });
        return;
    }

    const form = document.getElementById('scoreForm');
    form.reset();
    delete form.dataset.subjectIndex;
    document.getElementById('scoreFull').value = 100;
    document.getElementById('scoreFull').dataset.autoValue = '100';
    document.getElementById('scoreClassRank').value = '';
    document.getElementById('scoreGradeRank').value = '';
    updateScoreMax();
    document.getElementById('scoreModalTitle').textContent = '添加成绩';
    document.getElementById('scoreModal').classList.add('active');
}

export async function editSubjectScore(subjectIndex) {
    if (!state.currentExamId) return;

    const exams = getExams(getActiveProfileId());
    const examIndex = exams.findIndex(item => item.id === state.currentExamId);
    if (examIndex === -1) return;

    const subjects = exams[examIndex].subjects || [];
    if (subjectIndex >= subjects.length) return;

    const subject = subjects[subjectIndex];
    const form = document.getElementById('scoreForm');

    document.getElementById('subjectName').value = subject.name;
    document.getElementById('scoreValue').value = subject.score;
    document.getElementById('scoreFull').value = subject.fullScore || 100;
    document.getElementById('scoreFull').dataset.autoValue = '';
    document.getElementById('scoreClassRank').value = subject.classRank || '';
    document.getElementById('scoreGradeRank').value = subject.gradeRank || '';
    document.getElementById('scoreNotes').value = subject.notes || '';

    form.dataset.subjectIndex = subjectIndex;
    updateScoreMax();
    document.getElementById('scoreModalTitle').textContent = '编辑成绩';
    document.getElementById('scoreModal').classList.add('active');
}

export function deleteSubjectScore(subjectIndex) {
    if (!state.currentExamId) return;

    const exams = getExams(getActiveProfileId());
    const exam = exams.find(item => item.id === state.currentExamId);
    if (!exam) return;

    const subjects = exam.subjects || [];
    if (subjectIndex >= subjects.length) return;

    const subjectName = subjects[subjectIndex].name;

    document.getElementById('confirmModalTitle').textContent = '确定删除该科目？';
    document.getElementById('confirmModalMessage').textContent = `「${subjectName}」的成绩将被删除，此操作不可撤销`;
    state._confirmCallback = async () => {
        const allExams = getExamsAll();
        const targetExam = allExams.find(e => String(e.id) === String(state.currentExamId));
        if (!targetExam) return;
        targetExam.subjects.splice(subjectIndex, 1);
        saveExams(allExams);
        if (_refreshAll) await _refreshAll();
        showToast({ icon: '🗑️', iconType: 'success', title: '已删除', message: `「${subjectName}」已移除` });
    };
    document.getElementById('confirmModal').classList.add('active');
}

export function closeScoreModal() {
    document.getElementById('scoreModal').classList.remove('active');
}

export function editExam(examId) {
    openExamModal(examId);
}

export async function deleteExam(examId) {
    state.pendingDeleteExamId = examId;
    const exams = getExams(getActiveProfileId());
    const exam = exams.find(item => item.id == examId);
    document.getElementById('confirmModalTitle').textContent = '确定删除考试吗？';
    document.getElementById('confirmModalMessage').textContent = exam
        ? `“${exam.name}”的所有成绩都会被删除`
        : '此操作不可撤销';
    document.getElementById('confirmModal').classList.add('active');
}

export function setupConfirmModalEvents() {
    document.getElementById('confirmModalOk').addEventListener('click', async function() {
        const confirmCallback = state._confirmCallback;
        const pendingDeleteExamId = state.pendingDeleteExamId;

        state._confirmCallback = null;
        state.pendingDeleteExamId = null;
        document.getElementById('confirmModal').classList.remove('active');

        if (confirmCallback) {
            await confirmCallback();
        }
        if (pendingDeleteExamId !== null) {
            const allExams = getExamsAll();
            const newExams = allExams.filter(exam => exam.id != pendingDeleteExamId);
            saveExams(newExams);

            if (state.currentExamId == pendingDeleteExamId) {
                leaveEncouragementScene(ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY);
                state.currentExamId = null;
                state.detailEmptySceneKey = '';
            }

            if (_refreshAll) _refreshAll();
        }
    });

    document.getElementById('confirmModalCancel').addEventListener('click', function() {
        state.pendingDeleteExamId = null;
        state._confirmCallback = null;
        document.getElementById('confirmModal').classList.remove('active');
    });

    document.getElementById('confirmModal').addEventListener('click', function(e) {
        if (e.target === this) {
            state.pendingDeleteExamId = null;
            state._confirmCallback = null;
            this.classList.remove('active');
        }
    });
}

export function setupExamFormSubmit() {
    document.getElementById('examForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const exams = getExamsAll();
        const examId = this.dataset.examId;

        const examData = {
            profileId: getActiveProfileId(),
            name: document.getElementById('examName').value,
            startDate: document.getElementById('examStartDate').value,
            endDate: document.getElementById('examEndDate').value,
            notes: document.getElementById('examNotes').value,
            classTotal: parseInt(document.getElementById('examClassTotal').value, 10) || null,
            gradeTotal: parseInt(document.getElementById('examGradeTotal').value, 10) || null,
            totalClassRank: parseInt(document.getElementById('examTotalClassRank').value, 10) || null,
            totalGradeRank: parseInt(document.getElementById('examTotalGradeRank').value, 10) || null,
            subjects: []
        };

        rememberExamDefaults(getActiveProfileId(), {
            classTotal: examData.classTotal,
            gradeTotal: examData.gradeTotal
        });

        if (examId) {
            const index = exams.findIndex(exam => exam.id == examId);
            if (index !== -1) {
                examData.id = exams[index].id;
                examData.subjects = exams[index].subjects || [];
                examData.manualTotalScore = exams[index].manualTotalScore;
                if (!examData.classTotal && exams[index].classTotal) examData.classTotal = exams[index].classTotal;
                if (!examData.gradeTotal && exams[index].gradeTotal) examData.gradeTotal = exams[index].gradeTotal;
                if (!examData.totalClassRank && exams[index].totalClassRank) examData.totalClassRank = exams[index].totalClassRank;
                if (!examData.totalGradeRank && exams[index].totalGradeRank) examData.totalGradeRank = exams[index].totalGradeRank;
                exams[index] = examData;
            }
        } else {
            examData.id = Date.now();
            examData.createdAt = new Date().toISOString();
            exams.push(examData);
        }

        saveExams(exams);
        closeExamModal();
        leaveEncouragementScene(ENCOURAGEMENT_SCENES.EXAM_DETAIL_COLLAPSED_EMPTY);
        state.currentExamId = examData.id;
        state.detailEmptySceneKey = '';
        if (_refreshAll) await _refreshAll();
    });
}

export function setupScoreFormSubmit() {
    document.getElementById('scoreForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const exams = getExamsAll();
        const examIndex = exams.findIndex(exam => exam.id === state.currentExamId);
        if (examIndex === -1) return;

        if (!exams[examIndex].subjects) {
            exams[examIndex].subjects = [];
        }

        const subjectData = {
            name: document.getElementById('subjectName').value,
            score: parseInt(document.getElementById('scoreValue').value, 10),
            fullScore: parseInt(document.getElementById('scoreFull').value, 10) || 100,
            classRank: parseInt(document.getElementById('scoreClassRank').value, 10) || null,
            gradeRank: parseInt(document.getElementById('scoreGradeRank').value, 10) || null,
            notes: document.getElementById('scoreNotes').value
        };

        rememberSubjectFullScore(getActiveProfileId(), subjectData.name, subjectData.fullScore);

        const subjectIndex = this.dataset.subjectIndex;
        if (subjectIndex !== undefined) {
            exams[examIndex].subjects[subjectIndex] = subjectData;
        } else {
            exams[examIndex].subjects.push(subjectData);
        }

        saveExams(exams);
        closeScoreModal();
        if (_refreshAll) await _refreshAll();
    });
}

export function setupModalCloseEvents() {
    const examStartDateInput = document.getElementById('examStartDate');
    const examEndDateInput = document.getElementById('examEndDate');
    const subjectNameInput = document.getElementById('subjectName');
    const scoreFullInput = document.getElementById('scoreFull');

    document.getElementById('examModalClose').addEventListener('click', closeExamModal);
    document.getElementById('examModalCancel').addEventListener('click', closeExamModal);
    document.getElementById('scoreModalClose').addEventListener('click', closeScoreModal);
    document.getElementById('scoreModalCancel').addEventListener('click', closeScoreModal);
    document.getElementById('newExamBtn').addEventListener('click', () => openExamModal());

    examStartDateInput.addEventListener('change', applyAutoEndDate);
    examEndDateInput.addEventListener('input', function() {
        if (this.value !== this.dataset.autoValue) {
            this.dataset.autoValue = '';
        }
    });

    subjectNameInput.addEventListener('change', applyRememberedSubjectFullScore);
    subjectNameInput.addEventListener('blur', applyRememberedSubjectFullScore);
    scoreFullInput.addEventListener('input', function() {
        if (this.value !== this.dataset.autoValue) {
            this.dataset.autoValue = '';
        }
    });
}



