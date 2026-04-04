import state from './store.js';
import { getExams, getExamsAll, getActiveProfileId, saveExams } from './storage.js';
import { showToast } from './modal.js';
import { escHtml } from './utils.js';

let _refreshAll = null;

export function setDependencies({ refreshAll }) {
    _refreshAll = refreshAll;
}

function getCurrentExamSnapshot() {
    const currentExamId = String(state.currentExamId);
    const allExams = getExamsAll();
    const currentExam = allExams.find(exam => String(exam.id) === currentExamId);

    if (currentExam) return currentExam;

    const profileExams = getExams(getActiveProfileId());
    return profileExams.find(exam => String(exam.id) === currentExamId) || null;
}

export function openBatchModal() {
    if (!state.currentExamId) {
        showToast({ icon: '📌', iconType: 'info', title: '提示', message: '请先选择一场考试' });
        return;
    }

    const exam = getCurrentExamSnapshot();
    if (!exam) return;

    state.batchList = (exam.subjects || []).map(subject => ({
        name: subject.name,
        score: subject.score !== undefined ? String(subject.score) : '',
        classRank: subject.classRank ? String(subject.classRank) : '',
        gradeRank: subject.gradeRank ? String(subject.gradeRank) : '',
        fullScore: subject.fullScore || 100
    }));

    if (state.batchList.length === 0) {
        state.batchList.push({ name: '', score: '', classRank: '', gradeRank: '', fullScore: 100 });
    }

    document.getElementById('batchTableBody').innerHTML = '';
    renderBatchTable();
    document.getElementById('newBatchSubject').value = '';
    document.getElementById('batchModal').classList.add('active');
}

export function closeBatchModal() {
    document.getElementById('batchModal').classList.remove('active');
    document.getElementById('batchTableBody').innerHTML = '';
    state.batchList = [];
}

function renderBatchTable() {
    const tbody = document.getElementById('batchTableBody');

    tbody.querySelectorAll('.batch-input').forEach(input => {
        const idx = parseInt(input.dataset.idx, 10);
        const field = input.dataset.field;
        if (!Number.isNaN(idx) && field && state.batchList[idx]) {
            state.batchList[idx][field] = input.value;
        }
    });

    tbody.innerHTML = state.batchList.map((subject, index) => `
        <tr>
            <td class="batch-col-name"><input type="text" class="form-control batch-input" value="${escHtml(subject.name)}" data-idx="${index}" data-field="name" placeholder="科目名称"></td>
            <td class="batch-col-score"><input type="number" class="form-control batch-input" value="${subject.score}" data-idx="${index}" data-field="score" placeholder="分数"></td>
            <td class="batch-col-rank"><input type="number" class="form-control batch-input" value="${subject.classRank}" data-idx="${index}" data-field="classRank" placeholder="选填"></td>
            <td class="batch-col-rank"><input type="number" class="form-control batch-input" value="${subject.gradeRank}" data-idx="${index}" data-field="gradeRank" placeholder="选填"></td>
            <td class="batch-col-del"><button type="button" class="batch-del-btn" data-idx="${index}">&times;</button></td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.batch-input').forEach(input => {
        input.addEventListener('input', event => {
            const idx = parseInt(event.target.dataset.idx, 10);
            const field = event.target.dataset.field;
            state.batchList[idx][field] = event.target.value;
        });
    });

    tbody.querySelectorAll('.batch-del-btn').forEach(button => {
        button.addEventListener('click', event => {
            event.preventDefault();
            removeBatchSubject(parseInt(event.currentTarget.dataset.idx, 10));
        });
    });
}

function removeBatchSubject(index) {
    if (state.batchList.length <= 1) {
        showToast({ icon: '📌', iconType: 'info', title: '提示', message: '至少保留一个科目' });
        return;
    }
    state.batchList.splice(index, 1);
    renderBatchTable();
}

export function addBatchSubject() {
    const name = document.getElementById('newBatchSubject').value.trim();
    if (!name) {
        showToast({ icon: '📌', iconType: 'info', title: '提示', message: '请输入科目名' });
        return;
    }

    const allExams = getExams(getActiveProfileId()).filter(exam => String(exam.id) !== String(state.currentExamId));
    let fullScore = 100;

    for (const exam of allExams) {
        const found = (exam.subjects || []).find(subject => subject.name === name);
        if (found && found.fullScore) {
            fullScore = found.fullScore;
            break;
        }
    }

    state.batchList.push({ name, score: '', classRank: '', gradeRank: '', fullScore });
    document.getElementById('newBatchSubject').value = '';
    renderBatchTable();
}

export async function saveBatch() {
    const tbody = document.getElementById('batchTableBody');

    tbody.querySelectorAll('.batch-input').forEach(input => {
        const idx = parseInt(input.dataset.idx, 10);
        const field = input.dataset.field;
        if (!Number.isNaN(idx) && field && state.batchList[idx]) {
            state.batchList[idx][field] = input.value;
        }
    });

    const validSubjects = state.batchList.filter(subject => subject.name.trim());
    if (validSubjects.length === 0) {
        showToast({ icon: '📌', iconType: 'info', title: '提示', message: '至少填写一个科目' });
        return;
    }

    for (const subject of validSubjects) {
        if (subject.score === '' || Number.isNaN(Number(subject.score))) {
            showToast({ icon: '📌', iconType: 'info', title: '提示', message: `“${subject.name}”成绩无效` });
            return;
        }
    }

    const allExams = getExamsAll();
    const target = allExams.find(exam => String(exam.id) === String(state.currentExamId));
    if (!target) return;

    target.subjects = validSubjects.map(subject => ({
        name: subject.name.trim(),
        score: Number(subject.score),
        fullScore: Number.isNaN(Number(subject.fullScore)) ? 100 : Number(subject.fullScore),
        classRank: subject.classRank ? Number(subject.classRank) : undefined,
        gradeRank: subject.gradeRank ? Number(subject.gradeRank) : undefined
    }));

    saveExams(allExams);
    closeBatchModal();
    if (_refreshAll) await _refreshAll();
    showToast({ icon: '✓', iconType: 'success', title: '成功', message: '成绩已批量保存' });
}

export function setupBatchEvents() {
    document.getElementById('batchModalClose').addEventListener('click', closeBatchModal);
    document.getElementById('batchModalCancel').addEventListener('click', closeBatchModal);
    document.getElementById('batchSaveBtn').addEventListener('click', saveBatch);
    document.getElementById('newBatchSubject').addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addBatchSubject();
        }
    });
}
