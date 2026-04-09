import state from './store.js';
import { getExams, getActiveProfileId } from './storage.js';
import { callFunction } from './cloud-tcb.js';
import { getCurrentUser } from './auth.js';
import { showLoginPage } from './login-ui.js';
import { showToast } from './modal.js';
import { escHtml } from './utils.js';
import { getBatchSubjectHints, getBatchSubjectContext, applyParsedBatchSubjects } from './batch.js';
import { checkLimit as checkVipLimit, consumeQuota as consumeVipQuota } from './vip.js';
import { renderReportEntry, setLastAnalysisText } from './ai-chat.js';

const AI_CARD_ID = 'aiAnalysisCard';
const AI_BATCH_STATUS_ID = 'aiBatchStatus';
const AI_BATCH_INPUT_ID = 'aiBatchInput';
const AI_BATCH_BTN_ID = 'aiBatchParseBtn';
const AI_BATCH_ZONE_ID = 'aiBatchZone';
const AI_BATCH_BODY_ID = 'aiBatchBody';
const AI_BATCH_TOGGLE_ID = 'aiBatchToggleBtn';
const AI_BATCH_LOGIN_TIP_ID = 'aiBatchLoginTip';
const AI_BATCH_LOGIN_BTN_ID = 'aiBatchLoginBtn';
const AI_BATCH_PREVIEW_ID = 'aiBatchPreview';
const AI_BATCH_PREVIEW_LIST_ID = 'aiBatchPreviewList';
const AI_BATCH_PREVIEW_CONFIRM_ID = 'aiBatchPreviewConfirmBtn';
const AI_BATCH_PREVIEW_CANCEL_ID = 'aiBatchPreviewCancelBtn';

let initialized = false;
let analysisRequestToken = 0;
let lastAnalysisKey = '';
let lastAnalysisHtml = '';
let lastAnalysisMeta = null;
let debounceTimer = null;
let pendingBatchSubjects = [];
let aiBatchCollapsed = true;

const TEXT = {
    analysisEyebrow: '\u0041\u0049 \u5206\u6790\u62a5\u544a',
    analysisTitle: '\u6210\u7ee9\u5206\u6790\u52a9\u624b',
    analysisLoginTitle: '\u767b\u5f55\u540e\u5373\u53ef\u4f7f\u7528 AI \u5206\u6790',
    analysisLoginDesc: '\u767b\u5f55\u540e\uff0cAI \u4f1a\u7ed3\u5408\u5f53\u524d\u6863\u6848\u7684\u8003\u8bd5\u8bb0\u5f55\u751f\u6210\u8d8b\u52bf\u5224\u65ad\u3001\u4f18\u52bf\u79d1\u76ee\u548c\u6539\u8fdb\u5efa\u8bae\u3002',
    analysisLoginAction: '\u53bb\u767b\u5f55',
    analysisReadyTitle: '\u9700\u8981\u65f6\u518d\u8ba9 AI \u5f00\u59cb\u5206\u6790',
    analysisAction: '\u5f00\u59cb AI \u5206\u6790',
    analysisLoading: 'AI \u6b63\u5728\u9605\u8bfb\u5f53\u524d\u6863\u6848\u7684\u6210\u7ee9\u53d8\u5316\uff0c\u8bf7\u7a0d\u7b49\u7247\u523b\u3002',
    analysisRetry: '\u91cd\u8bd5',
    analysisRefresh: '\u91cd\u65b0\u5206\u6790',
    analysisWorking: '\u5206\u6790\u4e2d',
    analysisError: '\u8fd9\u6b21\u5206\u6790\u6ca1\u6709\u6210\u529f\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002',
    analysisNotEnoughTitle: '\u518d\u591a\u8bb0\u5f55\u51e0\u573a\u8003\u8bd5',
    analysisNotEnoughDesc: '\u81f3\u5c11\u8bb0\u5f55 2 \u573a\u8003\u8bd5\u540e\uff0cAI \u624d\u80fd\u66f4\u7a33\u5b9a\u5730\u770b\u51fa\u8d8b\u52bf\u53d8\u5316\u3002',
    batchNeedText: '\u5148\u8f93\u5165\u4e00\u6bb5\u6210\u7ee9\u6587\u672c\uff0c\u518d\u8ba9 AI \u5e2e\u4f60\u8bc6\u522b\u3002',
    batchNeedLogin: '\u8bf7\u5148\u767b\u5f55\u540e\u518d\u4f7f\u7528 AI \u8f85\u52a9\u5f55\u5165\u3002',
    batchPending: 'AI \u6b63\u5728\u8bc6\u522b\u6210\u7ee9\u6587\u672c\u2026',
    batchEmpty: '\u8fd9\u6bb5\u6587\u5b57\u91cc\u6ca1\u6709\u8bc6\u522b\u51fa\u53ef\u56de\u586b\u7684\u79d1\u76ee\u6210\u7ee9\u3002',
    batchParseFailed: 'AI \u8bc6\u522b\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5',
    batchPreviewTitle: '\u8bc6\u522b\u7ed3\u679c\u786e\u8ba4',
    batchPreviewConfirm: '\u786e\u8ba4\u56de\u586b\u5230\u8868\u683c',
    batchPreviewCancel: '\u53d6\u6d88\u7ed3\u679c',
    batchPreviewApplyToastTitle: 'AI \u5df2\u56de\u586b',
    batchPreviewApplyToastMessage: '\u8bc6\u522b\u7ed3\u679c\u5df2\u7ecf\u8fdb\u5165\u8868\u683c\uff0c\u8bf7\u786e\u8ba4\u540e\u518d\u4fdd\u5b58\u3002',
    batchPreviewCancelMessage: '\u5df2\u53d6\u6d88\u8fd9\u6b21\u8bc6\u522b\u7ed3\u679c\uff0c\u672c\u5730\u8868\u683c\u6ca1\u6709\u88ab\u6539\u52a8\u3002',
    batchPreviewReadyPrefix: '\u5df2\u8bc6\u522b\u51fa ',
    batchPreviewReadySuffix: ' \u79d1\u6210\u7ee9\uff0c\u8bf7\u5148\u786e\u8ba4\uff0c\u518d\u51b3\u5b9a\u662f\u5426\u56de\u586b\u5230\u8868\u683c\u3002',
    batchUpdated: '\u66f4\u65b0',
    batchCreated: '\u65b0\u589e',
    batchSubjectUnit: '\u79d1',
    batchAppliedPrefix: '\u8bc6\u522b\u7ed3\u679c\u5df2\u56de\u586b\u5230\u8868\u683c\uff1a',
    batchAppliedSuffix: '\u3002\u8bf7\u6838\u5bf9\u540e\u518d\u4fdd\u5b58\u3002',
    batchAppliedDefaultPrefix: '\u5171 ',
    batchAppliedDefaultSuffix: ' \u79d1',
    batchLoginPrompt: '\u767b\u5f55\u540e\u5373\u53ef\u4f7f\u7528 AI \u6210\u7ee9\u5206\u6790\u548c AI \u8f85\u52a9\u5f55\u5165\u3002',
    batchToastFailTitle: 'AI \u8bc6\u522b\u5931\u8d25',
    batchClassRank: '\u73ed\u6392',
    batchGradeRank: '\u5e74\u6392',
    collapseOpen: '\u5c55\u5f00',
    collapseClose: '\u6536\u8d77',
    quotaExhaustedTitle: '\u4eca\u65e5 AI \u5206\u6790\u6b21\u6570\u5df2\u7528\u5b8c',
};

function renderCard(html) {
    const container = document.getElementById(AI_CARD_ID);
    if (!container) return;
    container.innerHTML = html;
}

function getAnalysisEmptyHtml(title, desc) {
    return `
        <div class="ai-analysis-card">
            <div class="ai-analysis-card__header">
                <div>
                    <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>
                    <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>
                </div>
            </div>
            <div class="ai-analysis-card__empty">
                <div class="ai-analysis-card__empty-icon">🪄</div>
                <div class="ai-analysis-card__empty-title">${escHtml(title)}</div>
                <p class="ai-analysis-card__empty-desc">${escHtml(desc)}</p>
            </div>
        </div>
    `;
}

function renderLoginGuide() {
    renderCard(`
        <div class="ai-analysis-card">
            <div class="ai-analysis-card__header">
                <div>
                    <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>
                    <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>
                </div>
            </div>
            <div class="ai-analysis-card__empty">
                <div class="ai-analysis-card__empty-icon">🔐</div>
                <div class="ai-analysis-card__empty-title">${TEXT.analysisLoginTitle}</div>
                <p class="ai-analysis-card__empty-desc">${TEXT.analysisLoginDesc}</p>
                <button type="button" class="ai-analysis-card__action" id="aiAnalysisLoginBtn">${TEXT.analysisLoginAction}</button>
            </div>
        </div>
    `);

    document.getElementById('aiAnalysisLoginBtn')?.addEventListener('click', () => {
        showLoginPage(TEXT.batchLoginPrompt);
    });
}

function renderLoading() {
    renderCard(`
        <div class="ai-analysis-card">
            <div class="ai-analysis-card__header">
                <div>
                    <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>
                    <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>
                </div>
                <button type="button" class="ai-analysis-card__ghost" disabled>${TEXT.analysisWorking}</button>
            </div>
            <div class="ai-analysis-card__loading">
                <span class="ai-analysis-card__spinner"></span>
                <span>${TEXT.analysisLoading}</span>
            </div>
        </div>
    `);
}

function renderReady() {
    renderCard(`
        <div class="ai-analysis-card">
            <div class="ai-analysis-card__header">
                <div>
                    <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>
                    <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>
                </div>
            </div>
            <div class="ai-analysis-card__empty">
                <div class="ai-analysis-card__empty-icon">🤖</div>
                <div class="ai-analysis-card__empty-title">${TEXT.analysisReadyTitle}</div>
                <button type="button" class="ai-analysis-card__action" id="aiAnalysisRunBtn">${TEXT.analysisAction}</button>
            </div>
        </div>
    `);
    bindRunButton();
}

function renderError(message) {
    renderCard(`
        <div class="ai-analysis-card">
            <div class="ai-analysis-card__header">
                <div>
                    <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>
                    <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>
                </div>
                <button type="button" class="ai-analysis-card__refresh" id="aiAnalysisRefreshBtn">${TEXT.analysisRetry}</button>
            </div>
            <div class="ai-analysis-card__error">
                <div class="ai-analysis-card__error-icon">⚠️</div>
                <p>${escHtml(message || TEXT.analysisError)}</p>
            </div>
        </div>
    `);
    bindRefreshButton();
}

function renderQuotaExhausted(quotaCheck) {
    const remaining = quotaCheck.limit - quotaCheck.used;
    renderCard(`
        <div class="ai-analysis-card">
            <div class="ai-analysis-card__header">
                <div>
                    <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>
                    <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>
                </div>
            </div>
            <div class="ai-analysis-card__empty">
                <div class="ai-analysis-card__empty-icon">🔒</div>
                <div class="ai-analysis-card__empty-title">${escHtml(quotaCheck.reason || TEXT.quotaExhaustedTitle)}</div>
                <p class="ai-analysis-card__empty-desc">升级 VIP 可解除次数限制，每日无限使用。</p>
            </div>
        </div>
    `);
}

function formatAnalysisHtml(text) {
    const escaped = escHtml(text || '');
    const withStrong = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return withStrong
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean)
        .map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function renderSourceNotice(meta) {
    if (!meta || meta.source !== 'fallback') return '';
    const detail = meta?.fallbackReason
        ? `<div class="ai-analysis-card__notice-detail">${escHtml(meta.fallbackReason)}</div>`
        : '';
    return `
        <div class="ai-analysis-card__notice warning">
            当前显示的是基础分析结果，AI 大模型尚未成功连通。
            ${detail}
        </div>
    `;
}

function renderSuccess(text, meta = null) {
    renderCard(`
        <div class="ai-analysis-card">
            <div class="ai-analysis-card__header">
                <div>
                    <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>
                    <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>
                </div>
                <button type="button" class="ai-analysis-card__refresh" id="aiAnalysisRefreshBtn">${TEXT.analysisRefresh}</button>
            </div>
            ${renderSourceNotice(meta)}
            <div class="ai-analysis-card__body">${formatAnalysisHtml(text)}</div>
        </div>
    `);
    bindRefreshButton();
    setLastAnalysisText(text);
    renderReportEntry();
}

function bindRefreshButton() {
    document.getElementById('aiAnalysisRefreshBtn')?.addEventListener('click', () => {
        refreshAIAnalysisCard({ force: true });
    });
}

function bindRunButton() {
    document.getElementById('aiAnalysisRunBtn')?.addEventListener('click', () => {
        refreshAIAnalysisCard({ force: true });
    });
}

function normalizeExamDate(exam) {
    return exam.startDate || exam.endDate || exam.createdAt || '';
}

function buildAnalysisPayload(exams) {
    return exams
        .map((exam) => ({
            name: exam.name,
            date: normalizeExamDate(exam),
            totalScore: Number(
                exam.manualTotalScore ?? ((exam.subjects || []).reduce((sum, subject) => sum + (Number(subject.score) || 0), 0))
            ),
            totalClassRank: exam.totalClassRank || null,
            totalGradeRank: exam.totalGradeRank || null,
            classTotal: exam.classTotal || null,
            gradeTotal: exam.gradeTotal || null,
            subjects: (exam.subjects || []).map((subject) => ({
                name: subject.name,
                score: Number(subject.score) || 0,
                fullScore: Number(subject.fullScore) || 100,
                classRank: subject.classRank || null,
                gradeRank: subject.gradeRank || null
            }))
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function setBatchStatus(message, type = 'info') {
    const statusEl = document.getElementById(AI_BATCH_STATUS_ID);
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.dataset.type = type;
}

function setBatchLoading(loading) {
    const btn = document.getElementById(AI_BATCH_BTN_ID);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '\u8bc6\u522b\u4e2d\u2026' : 'AI \u8bc6\u522b';
}

function setBatchCollapsed(collapsed) {
    aiBatchCollapsed = collapsed;
    const zone = document.getElementById(AI_BATCH_ZONE_ID);
    const body = document.getElementById(AI_BATCH_BODY_ID);
    const toggle = document.getElementById(AI_BATCH_TOGGLE_ID);
    if (!zone || !body || !toggle) return;

    zone.classList.toggle('collapsed', collapsed);
    body.hidden = collapsed;
    toggle.textContent = collapsed ? TEXT.collapseOpen : TEXT.collapseClose;
    toggle.setAttribute('aria-expanded', String(!collapsed));
}

async function refreshBatchAuthHint() {
    const loginTip = document.getElementById(AI_BATCH_LOGIN_TIP_ID);
    const loginBtn = document.getElementById(AI_BATCH_LOGIN_BTN_ID);
    const parseBtn = document.getElementById(AI_BATCH_BTN_ID);
    if (!loginTip || !parseBtn) return;

    const user = await getCurrentUser();
    loginTip.classList.toggle('hidden', Boolean(user));
    parseBtn.dataset.loginRequired = user ? 'false' : 'true';

    if (!user) {
        loginBtn?.addEventListener('click', () => {
            showLoginPage(TEXT.batchLoginPrompt);
        }, { once: true });
    }
}

function renderBatchPreview(subjects = []) {
    const preview = document.getElementById(AI_BATCH_PREVIEW_ID);
    const list = document.getElementById(AI_BATCH_PREVIEW_LIST_ID);
    const confirmBtn = document.getElementById(AI_BATCH_PREVIEW_CONFIRM_ID);
    const cancelBtn = document.getElementById(AI_BATCH_PREVIEW_CANCEL_ID);
    if (!preview || !list || !confirmBtn || !cancelBtn) return;

    if (!subjects.length) {
        preview.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    list.innerHTML = subjects.map((subject) => {
        const score = Number(subject.score);
        const fullScore = Number.isFinite(Number(subject.fullScore)) ? Number(subject.fullScore) : 100;
        const extra = [];
        if (subject.classRank !== undefined && subject.classRank !== null && subject.classRank !== '') {
            extra.push(`${TEXT.batchClassRank} ${escHtml(String(subject.classRank))}`);
        }
        if (subject.gradeRank !== undefined && subject.gradeRank !== null && subject.gradeRank !== '') {
            extra.push(`${TEXT.batchGradeRank} ${escHtml(String(subject.gradeRank))}`);
        }
        return `
            <div class="ai-batch-preview-item">
                <div class="ai-batch-preview-name">${escHtml(subject.name || '')}</div>
                <div class="ai-batch-preview-meta">
                    <span>${escHtml(String(score))} / ${escHtml(String(fullScore))}</span>
                    ${extra.length ? `<span>${extra.join(' · ')}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    preview.classList.remove('hidden');
    confirmBtn.onclick = () => {
        const { updated, created } = applyParsedBatchSubjects(pendingBatchSubjects);
        const segments = [];
        if (updated) segments.push(`${TEXT.batchUpdated} ${updated} ${TEXT.batchSubjectUnit}`);
        if (created) segments.push(`${TEXT.batchCreated} ${created} ${TEXT.batchSubjectUnit}`);
        const summary = segments.join('，') || `${TEXT.batchAppliedDefaultPrefix}${pendingBatchSubjects.length}${TEXT.batchAppliedDefaultSuffix}`;
        setBatchStatus(`${TEXT.batchAppliedPrefix}${summary}${TEXT.batchAppliedSuffix}`, 'success');
        showToast({
            icon: '🤖',
            iconType: 'success',
            title: TEXT.batchPreviewApplyToastTitle,
            message: TEXT.batchPreviewApplyToastMessage
        });
        pendingBatchSubjects = [];
        renderBatchPreview([]);
        setBatchCollapsed(false);
    };
    cancelBtn.onclick = () => {
        pendingBatchSubjects = [];
        renderBatchPreview([]);
        setBatchStatus(TEXT.batchPreviewCancelMessage, 'info');
    };
}

function normalizeParsedSubjects(subjects = []) {
    return subjects
        .map((subject) => ({
            name: String(subject?.name || '').trim(),
            score: subject?.score,
            fullScore: Number.isFinite(Number(subject?.fullScore)) ? Number(subject.fullScore) : 100,
            classRank: subject?.classRank ?? '',
            gradeRank: subject?.gradeRank ?? ''
        }))
        .filter((subject) => subject.name && subject.score !== '' && subject.score !== null && subject.score !== undefined && !Number.isNaN(Number(subject.score)));
}

async function handleBatchParse() {
    const input = document.getElementById(AI_BATCH_INPUT_ID);
    const rawText = String(input?.value || '').trim();

    if (!rawText) {
        setBatchStatus(TEXT.batchNeedText, 'warning');
        return;
    }

    const user = await getCurrentUser();
    if (!user) {
        setBatchStatus(TEXT.batchNeedLogin, 'warning');
        await refreshBatchAuthHint();
        setBatchCollapsed(false);
        showLoginPage(TEXT.batchLoginPrompt);
        return;
    }

    setBatchLoading(true);
    setBatchStatus(TEXT.batchPending, 'pending');
    setBatchCollapsed(false);

    try {
        const result = await callFunction('ai_service', {
            action: 'inputParse',
            data: {
                text: rawText,
                subjectHints: getBatchSubjectHints(),
                subjectContext: getBatchSubjectContext()
            }
        });

        if (result?.code !== 0) {
            throw new Error(result?.message || TEXT.batchParseFailed);
        }

        const parsedSubjects = normalizeParsedSubjects(result?.data?.subjects || []);
        if (parsedSubjects.length === 0) {
            setBatchStatus(TEXT.batchEmpty, 'warning');
            renderBatchPreview([]);
            return;
        }

        pendingBatchSubjects = parsedSubjects;
        renderBatchPreview(parsedSubjects);
        setBatchCollapsed(false);
        setBatchStatus(`${TEXT.batchPreviewReadyPrefix}${parsedSubjects.length}${TEXT.batchPreviewReadySuffix}`, 'success');
    } catch (error) {
        const message = error?.message || TEXT.batchParseFailed;
        setBatchStatus(message, 'error');
        showToast({ icon: '⚠️', iconType: 'warning', title: TEXT.batchToastFailTitle, message });
    } finally {
        setBatchLoading(false);
    }
}

function bindBatchEvents() {
    document.getElementById(AI_BATCH_BTN_ID)?.addEventListener('click', handleBatchParse);
    document.getElementById(AI_BATCH_TOGGLE_ID)?.addEventListener('click', () => {
        setBatchCollapsed(!aiBatchCollapsed);
    });
    document.getElementById(AI_BATCH_INPUT_ID)?.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            handleBatchParse();
        }
    });

    document.addEventListener('batch-modal-opened', async () => {
        pendingBatchSubjects = [];
        renderBatchPreview([]);
        setBatchStatus('', 'info');
        setBatchLoading(false);
        setBatchCollapsed(true);
        await refreshBatchAuthHint();
    });
}

export async function refreshAIAnalysisCard({ force = false } = {}) {
    const container = document.getElementById(AI_CARD_ID);
    if (!container) return;

    if (state.trendAnalysisMode === 'radar') {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';

    const user = await getCurrentUser();
    if (!user) {
        renderLoginGuide();
        return;
    }

    const exams = getExams(getActiveProfileId(), true);
    if (exams.length < 2) {
        renderCard(getAnalysisEmptyHtml(TEXT.analysisNotEnoughTitle, TEXT.analysisNotEnoughDesc));
        return;
    }

    const payload = buildAnalysisPayload(exams);
    const cacheKey = JSON.stringify(payload);
    if (!force) {
        if (cacheKey === lastAnalysisKey && lastAnalysisHtml) {
            renderSuccess(lastAnalysisHtml, lastAnalysisMeta);
            return;
        }

        renderReady();
        return;
    }

    const requestToken = ++analysisRequestToken;
    renderLoading();

    // VIP 配额检查
    const quotaCheck = checkVipLimit('aiAnalysis');
    if (!quotaCheck.allowed) {
        renderQuotaExhausted(quotaCheck);
        return;
    }

    try {
        const result = await callFunction('ai_service', {
            action: 'analyze',
            data: { exams: payload }
        });

        if (requestToken !== analysisRequestToken) return;

        if (result?.code !== 0 || !result?.data?.text) {
            throw new Error(result?.message || '\u0041\u0049 \u6682\u65f6\u6ca1\u6709\u8fd4\u56de\u53ef\u7528\u5185\u5bb9');
        }

        lastAnalysisKey = cacheKey;
        lastAnalysisHtml = result.data.text;
        lastAnalysisMeta = {
            source: result?.data?.source || '',
            fallbackReason: result?.data?.fallbackReason || ''
        };
        consumeVipQuota('aiAnalysis');
        renderSuccess(result.data.text, lastAnalysisMeta);
    } catch (error) {
        if (requestToken !== analysisRequestToken) return;
        renderError(error?.message || TEXT.analysisError);
    }
}

export function scheduleAIAnalysisRefresh({ force = false } = {}) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        refreshAIAnalysisCard({ force });
    }, force ? 0 : 260);
}

export function initAI() {
    if (initialized) return;
    initialized = true;
    bindBatchEvents();
}
