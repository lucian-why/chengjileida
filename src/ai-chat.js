/**
 * ai-chat.js — AI 对话模块
 *
 * 三种入口，共享同一个聊天面板：
 *   1. 报告区入口：分析报告后「想进一步了解孩子这次成绩？和 AI 聊聊」
 *   2. 科目对比入口：科目对比 tab 旁「AI 追问」
 *   3. 全局入口：设置旁「AI 对话」
 *
 * 对话上下文：
 *   - 从报告区来：自动带上分析报告文本 + 开场语
 *   - 从科目对比来：自动带上科目对比数据 + 开场语
 *   - 从全局入口来：无预填，通用开场
 */

import state from './store.js';
import { getExams, getActiveProfileId } from './storage.js';
import { callFunction } from './cloud-tcb.js';
import { getCurrentUser } from './auth.js';
import { showLoginPage } from './login-ui.js';
import { showToast } from './modal.js';
import { escHtml } from './utils.js';
import { checkLimit as checkVipLimit, consumeQuota as consumeVipQuota } from './vip.js';

// ===== DOM ID 常量 =====
const CHAT_OVERLAY_ID = 'aiChatOverlay';
const CHAT_MESSAGES_ID = 'aiChatMessages';
const CHAT_INPUT_ID = 'aiChatInput';
const CHAT_SEND_BTN_ID = 'aiChatSendBtn';
const CHAT_CLOSE_BTN_ID = 'aiChatCloseBtn';
const CHAT_TITLE_ID = 'aiChatTitle';

// ===== 对话状态 =====
let chatMessages = [];     // { role: 'user'|'assistant', content: string }
let chatContext = null;     // 入口上下文 { type: 'report'|'compare'|'global', data: any }
let isChatBusy = false;

// ===== 文本 =====
const TEXT = {
    titleReport: 'AI 成绩对话',
    titleCompare: 'AI 追问',
    titleGlobal: 'AI 对话',
    placeholder: '输入你的问题…',
    send: '发送',
    busy: 'AI 正在思考…',
    loginTitle: '登录后即可使用 AI 对话',
    loginDesc: '登录后，AI 可以结合当前档案的成绩数据，和你深入分析学习情况。',
    loginAction: '去登录',
    noDataTitle: '还没有考试记录',
    noDataDesc: '至少记录 1 场考试后，AI 才能和你聊成绩相关的话题。',
    errorRetry: '发送失败，点击重试',
    contextReport: '请结合当前成绩分析报告，详细分析孩子的整体表现。',
    contextCompare: '请结合当前科目对比，分析优势科目、薄弱科目和提升建议。',
    contextGlobal: '你可以继续追问成绩、排名、科目变化和学习建议。',
    entryReport: '想进一步了解孩子这次成绩？和 AI 聊聊 →',
    entryCompare: 'AI 追问',
    entryGlobal: 'AI 对话',
    clearChat: '清空对话',
};

// ===== 公共 API =====

/**
 * 打开 AI 对话面板
 * @param {'report'|'compare'|'global'} source - 入口来源
 * @param {object} [extra] - 附加数据
 *   - report 入口：extra.analysisText = 分析报告文本
 *   - compare 入口：extra.compareData = 科目对比数据
 */
export function openAIChat(source = 'global', extra = {}) {
    const overlay = document.getElementById(CHAT_OVERLAY_ID);
    if (!overlay) return;

    // 检查登录
    getCurrentUser().then(user => {
        if (!user) {
            renderLoginState();
            overlay.classList.add('active');
            return;
        }

        // 检查数据
        const exams = getExams(getActiveProfileId(), true);
        if (exams.length < 1) {
            renderNoDataState();
            overlay.classList.add('active');
            return;
        }

        // 设置上下文
        chatContext = { type: source, data: extra };

        // 设置标题
        const titleEl = document.getElementById(CHAT_TITLE_ID);
        if (titleEl) {
            titleEl.textContent = source === 'report' ? TEXT.titleReport
                : source === 'compare' ? TEXT.titleCompare
                : TEXT.titleGlobal;
        }

        // 如果是新对话（从不同入口打开），插入开场消息
        if (chatMessages.length === 0) {
            const openingText = source === 'report' ? TEXT.contextReport
                : source === 'compare' ? TEXT.contextCompare
                : TEXT.contextGlobal;
            chatMessages.push({ role: 'assistant', content: openingText });
        }

        renderMessages();
        overlay.classList.add('active');
        focusInput();
    });
}

/** 关闭 AI 对话面板 */
export function closeAIChat() {
    const overlay = document.getElementById(CHAT_OVERLAY_ID);
    if (overlay) overlay.classList.remove('active');
}

/** 初始化 AI 对话模块（绑定事件） */
export function initAIChat() {
    // 发送按钮
    document.getElementById(CHAT_SEND_BTN_ID)?.addEventListener('click', handleSend);

    // 输入框回车发送
    document.getElementById(CHAT_INPUT_ID)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            handleSend();
        }
    });

    // 关闭按钮
    document.getElementById(CHAT_CLOSE_BTN_ID)?.addEventListener('click', closeAIChat);

    // 点击遮罩关闭
    document.getElementById(CHAT_OVERLAY_ID)?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAIChat();
    });

    // 清空对话按钮
    document.getElementById('aiChatClearBtn')?.addEventListener('click', () => {
        if (chatMessages.length === 0) return;
        if (confirm('确定要清空所有聊天记录吗？')) {
            chatMessages = [];
            chatContext = null;
            renderMessages();
        }
    });
}

// ===== 内部逻辑 =====

async function handleSend() {
    const input = document.getElementById(CHAT_INPUT_ID);
    const text = String(input?.value || '').trim();
    if (!text || isChatBusy) return;

    input.value = '';
    autoResizeInput();

    // VIP 配额检查
    const chatQuota = checkVipLimit('aiChat');
    if (!chatQuota.allowed) {
        chatMessages.push({ role: 'user', content: text });
        const remaining = chatQuota.limit - chatQuota.used;
        chatMessages.push({
            role: 'assistant',
            content: `今日 AI 对话次数已用完（${chatQuota.limit}轮/${chatQuota.limit}），明天再来聊吧~ 升级 VIP 可解除限制。`,
            isError: true
        });
        renderMessages();
        scrollToBottom();
        showToast({
            icon: '🔒',
            iconType: 'warning',
            title: '对话次数已用完',
            message: chatQuota.reason
        });
        return;
    }

    // 用户消息
    chatMessages.push({ role: 'user', content: text });
    renderMessages();
    scrollToBottom();

    // 发给 AI — 通过云函数 chat action，前端模拟流式输出
    isChatBusy = true;
    renderTypingIndicator();

    try {
        const aiMessages = buildAIMessages();
        const result = await callFunction('ai_service', {
            action: 'chat',
            data: { messages: aiMessages }
        });

        if (result?.code !== 0 || !result?.data?.text) {
            throw new Error(result?.message || 'AI 没有返回有效内容');
        }

        const fullText = result.data.text;

        // 移除 typing indicator，用打字机效果逐字显示
        const emptyIdx = chatMessages.length;
        chatMessages.push({ role: 'assistant', content: '' });
        renderMessages();

        // 打字机效果：逐字输出
        await typewriterEffect(emptyIdx, fullText);

        consumeVipQuota('aiChat');
    } catch (error) {
        // 如果最后一条是空的 assistant 消息，替换为错误消息
        const lastMsg = chatMessages[chatMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content.trim()) {
            chatMessages[chatMessages.length - 1] = { role: 'assistant', content: TEXT.errorRetry, isError: true };
        } else {
            chatMessages.push({ role: 'assistant', content: TEXT.errorRetry, isError: true });
        }
        showToast({ icon: '⚠️', iconType: 'warning', title: 'AI 对话失败', message: error?.message || '请稍后重试' });
    } finally {
        isChatBusy = false;
        renderMessages();
        scrollToBottom();
        focusInput();
    }
}

function buildAIMessages() {
    // 系统提示
    const systemPrompt = buildSystemPrompt();

    const messages = [{ role: 'system', content: systemPrompt }];

    // 历史消息（最近 20 轮，避免 token 过长）
    const recent = chatMessages.slice(-40);
    recent.forEach(msg => {
        if (msg.isError) return;
        messages.push({ role: msg.role, content: msg.content });
    });

    return messages;
}

function buildSystemPrompt() {
    const exams = getExams(getActiveProfileId(), true);
    const examSummary = exams.slice(-6).map(exam => {
        const subjects = (exam.subjects || []).map(s => `${s.name}:${s.score}/${s.fullScore || 100}`).join(', ');
        return `${exam.name}(${exam.startDate || exam.createdAt || ''}) 总分:${exam.manualTotalScore || (exam.subjects || []).reduce((sum, s) => sum + (Number(s.score) || 0), 0)} ${subjects ? '[' + subjects + ']' : ''}`;
    }).join('\n');

    let prompt = `你是"成绩雷达"的 AI 学习分析助手。你可以和用户进行自然对话，回答关于成绩、学习、考试的问题。

当前档案的考试数据（最近几场）：
${examSummary || '暂无考试数据'}

对话要求：
1. 语言温和、简洁、有具体建议。
2. 可以引用上面的考试数据来支撑你的分析。
3. 不要编造数据，如果信息不足就明确说"当前数据还不够"。
4. 回答控制在 300 字以内，除非用户要求详细分析。`;

    // 如果从报告入口进入，附上分析报告
    if (chatContext?.type === 'report' && chatContext?.data?.analysisText) {
        prompt += `\n\n当前 AI 分析报告内容：\n${chatContext.data.analysisText}`;
    }

    // 如果从科目对比入口进入，附上对比数据
    if (chatContext?.type === 'compare' && chatContext?.data?.compareData) {
        prompt += `\n\n当前科目对比数据：\n${JSON.stringify(chatContext.data.compareData, null, 2)}`;
    }

    return prompt;
}

// ===== 渲染 =====

/**
 * 打字机效果：逐字显示文本，模拟流式输出体验
 * @param {number} messageIdx - chatMessages 中的索引
 * @param {string} fullText - 完整文本
 */
function typewriterEffect(messageIdx, fullText) {
    return new Promise((resolve) => {
        const CHUNK_SIZE = 3; // 每次显示的字符数
        const DELAY = 18;     // 每次显示的间隔（ms）
        let pos = 0;

        function step() {
            pos += CHUNK_SIZE;
            if (pos >= fullText.length) {
                chatMessages[messageIdx] = { role: 'assistant', content: fullText };
                updateLastAssistantBubble(fullText);
                scrollToBottom();
                resolve();
                return;
            }
            chatMessages[messageIdx] = { role: 'assistant', content: fullText.slice(0, pos) };
            updateLastAssistantBubble(fullText.slice(0, pos));
            scrollToBottom();
            setTimeout(step, DELAY);
        }
        step();
    });
}

function renderMessages() {
    const container = document.getElementById(CHAT_MESSAGES_ID);
    if (!container) return;

    container.innerHTML = chatMessages.map((msg, idx) => {
        if (msg.role === 'user') {
            return `<div class="ai-chat-msg user"><div class="ai-chat-msg-bubble">${escHtml(msg.content)}</div></div>`;
        }
        // assistant
        const html = formatAssistantMessage(msg.content, msg.isError);
        const errorClass = msg.isError ? ' error' : '';
        return `<div class="ai-chat-msg assistant${errorClass}"><div class="ai-chat-msg-avatar">🤖</div><div class="ai-chat-msg-bubble">${html}</div></div>`;
    }).join('');
}

function renderTypingIndicator() {
    const container = document.getElementById(CHAT_MESSAGES_ID);
    if (!container) return;

    // 移除已有的 typing indicator
    container.querySelectorAll('.ai-chat-typing').forEach(el => el.remove());

    const typing = document.createElement('div');
    typing.className = 'ai-chat-msg assistant ai-chat-typing';
    typing.innerHTML = `<div class="ai-chat-msg-avatar">🤖</div><div class="ai-chat-msg-bubble"><span class="ai-chat-typing-dots"><span></span><span></span><span></span></span></div>`;
    container.appendChild(typing);
    scrollToBottom();
}

function renderLoginState() {
    const container = document.getElementById(CHAT_MESSAGES_ID);
    if (!container) return;
    container.innerHTML = `
        <div class="ai-chat-login-state">
            <div class="ai-chat-login-icon">🔐</div>
            <div class="ai-chat-login-title">${TEXT.loginTitle}</div>
            <p class="ai-chat-login-desc">${TEXT.loginDesc}</p>
            <button type="button" class="ai-chat-login-btn" id="aiChatLoginBtn">${TEXT.loginAction}</button>
        </div>
    `;
    document.getElementById('aiChatLoginBtn')?.addEventListener('click', () => {
        showLoginPage(TEXT.loginDesc);
    });
}

function renderNoDataState() {
    const container = document.getElementById(CHAT_MESSAGES_ID);
    if (!container) return;
    container.innerHTML = `
        <div class="ai-chat-login-state">
            <div class="ai-chat-login-icon">📝</div>
            <div class="ai-chat-login-title">${TEXT.noDataTitle}</div>
            <p class="ai-chat-login-desc">${TEXT.noDataDesc}</p>
        </div>
    `;
}

function formatAssistantMessage(text, isError = false) {
    if (isError) {
        return `<span class="ai-chat-error-text">${escHtml(text)}</span>`;
    }
    const escaped = escHtml(text || '');
    const withStrong = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return withStrong
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean)
        .map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        const container = document.getElementById(CHAT_MESSAGES_ID);
        if (container) container.scrollTop = container.scrollHeight;
    });
}

/**
 * 高效更新最后一个 assistant 消息气泡（流式输出时避免整列表重绘）
 */
function updateLastAssistantBubble(text) {
    const container = document.getElementById(CHAT_MESSAGES_ID);
    if (!container) return;
    const lastMsg = container.lastElementChild;
    if (!lastMsg || !lastMsg.classList.contains('assistant')) return;
    const bubble = lastMsg.querySelector('.ai-chat-msg-bubble');
    if (!bubble) return;
    bubble.innerHTML = formatAssistantMessage(text);
}

function focusInput() {
    requestAnimationFrame(() => {
        document.getElementById(CHAT_INPUT_ID)?.focus();
    });
}

function autoResizeInput() {
    const input = document.getElementById(CHAT_INPUT_ID);
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

// ===== 入口按钮渲染 =====

/**
 * 渲染报告区入口按钮（插入到 AI 分析卡片底部）
 */
export function renderReportEntry() {
    const card = document.getElementById('aiAnalysisCard');
    if (!card) return;

    // 避免重复添加
    if (card.querySelector('.ai-chat-entry-report')) return;

    const entry = document.createElement('div');
    entry.className = 'ai-chat-entry-report';
    entry.innerHTML = `<button type="button" class="ai-chat-entry-btn report">${TEXT.entryReport}</button>`;
    entry.querySelector('button')?.addEventListener('click', () => {
        // 获取当前分析文本
        const analysisText = lastAnalysisHtml || '';
        openAIChat('report', { analysisText });
    });
    card.appendChild(entry);
}

/**
 * 渲染科目对比入口按钮
 */
export function renderCompareEntry() {
    const tabs = document.getElementById('analysisModeTabs');
    if (!tabs) return;

    // 避免重复添加
    if (tabs.querySelector('.ai-chat-entry-compare')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chart-tab ai-chat-entry-compare';
    btn.textContent = TEXT.entryCompare;
    btn.addEventListener('click', () => {
        openAIChat('compare', { compareData: buildCompareData() });
    });
    tabs.appendChild(btn);
}

/**
 * 渲染全局入口按钮（设置 tab 旁）
 */
export function renderGlobalEntry() {
    const tabBar = document.querySelector('.tabs');
    if (!tabBar) return;

    // 避免重复添加
    if (tabBar.querySelector('.ai-chat-entry-global')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab ai-chat-entry-global';
    btn.textContent = TEXT.entryGlobal;
    btn.addEventListener('click', () => {
        openAIChat('global');
    });
    tabBar.appendChild(btn);
}

function buildCompareData() {
    const exams = getExams(getActiveProfileId(), true);
    const currentExam = exams.find(e => e.id === state.currentExamId);
    if (!currentExam) return null;

    return {
        currentExam: {
            name: currentExam.name,
            subjects: (currentExam.subjects || []).map(s => ({
                name: s.name,
                score: s.score,
                fullScore: s.fullScore || 100,
                rate: ((s.score / (s.fullScore || 100)) * 100).toFixed(1) + '%'
            }))
        },
        compareExams: (state.selectedCompareIds || []).map(id => {
            const exam = exams.find(e => e.id === id);
            if (!exam) return null;
            return {
                name: exam.name,
                subjects: (exam.subjects || []).map(s => ({
                    name: s.name,
                    score: s.score,
                    fullScore: s.fullScore || 100,
                    rate: ((s.score / (s.fullScore || 100)) * 100).toFixed(1) + '%'
                }))
            };
        }).filter(Boolean)
    };
}

// 存储最后一份分析文本（供报告入口使用）
let lastAnalysisHtml = '';

export function setLastAnalysisText(text) {
    lastAnalysisHtml = text || '';
}

// 输入框自动高度
document.addEventListener('input', (e) => {
    if (e.target?.id === CHAT_INPUT_ID) {
        autoResizeInput();
    }
});
