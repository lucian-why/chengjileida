/**
 * login-ui.js — 登录/注册 UI（合并模式）
 *
 * 职责：渲染登录弹窗、处理登录交互、显示登录状态
 *
 * 设计方案（2026-04-06 重构）：
 *   合并模式 —— 不区分"注册"和"登录"两个入口
 *   - 统一输入框：自动识别用户输入的是邮箱还是手机号
 *     · 含 @ → 邮箱验证码 / 密码登录
 *     · 11位手机号 → 短信验证码登录（家长用）
 *   - 默认展示：账号 + 验证码（新用户自动注册，老用户直接登录）
 *   - 备选方式："或使用密码登录 ▸" 切换到密码输入框
 *   - 密码为可选：验证码模式下可填可不填，密码模式必填
 *
 * 依赖：
 *   - auth.js：sendEmailCode / sendSmsCode / emailCodeLogin / smsLogin / passwordLogin
 *
 * 对外暴露：
 *   - showLoginPage(message) / hideLoginPage()
 *   - renderAuthStatus(user) / clearAuthStatus()
 *   - setLoginSuccessHandler(handler) / setLogoutHandler(handler)
 */

import { sendEmailCode, sendSmsCode, emailCodeLogin, smsLogin, passwordLogin } from './auth.js';

let onLoginSuccess = null;
let onLogout = null;
let uiBound = false;

/** 当前登录模式：'code'(验证码) | 'password'(密码) */
let currentMode = 'code';

/**
 * 智能识别输入类型：email | phone | unknown
 */
function detectInputType(value) {
    const trimmed = (value || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'email';
    if (/^1[3-9]\d{9}$/.test(trimmed)) return 'phone';
    return 'unknown';
}

/**
 * 根据当前输入返回友好的标签文字
 */
function getAccountLabel(value) {
    const type = detectInputType(value);
    if (type === 'email') return '邮箱';
    if (type === 'phone') return '手机号';
    return '邮箱 / 手机号';
}


// ===== DOM 构建 =====

function ensureLoginUi() {
    let overlay = document.getElementById('loginPage');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loginPage';
        overlay.className = 'login-page hidden';
        overlay.innerHTML = `
            <div class="login-card">
                <button type="button" class="login-close-btn" id="loginCloseBtn" aria-label="关闭">×</button>
                <div class="login-logo">成绩雷达</div>
                <p class="login-subtitle">登录后可启用云端备份与多端同步</p>

                <div class="login-form">
                    <!-- 统一账号输入框（自动识别邮箱/手机号） -->
                    <label class="login-label" id="loginAccountLabel" for="loginAccountInput">邮箱 / 手机号</label>
                    <input id="loginAccountInput" class="login-input" type="text"
                           placeholder="请输入邮箱或手机号" maxlength="100" autocomplete="username" />

                    <!-- 验证码区域（默认展示） -->
                    <div id="codeModeSection">
                        <label class="login-label" for="loginCodeInput">验证码</label>
                        <div class="login-inline-row">
                            <input id="loginCodeInput" class="login-input" type="text"
                                   inputmode="numeric" placeholder="请输入 6 位验证码" maxlength="6" />
                            <button id="sendCodeBtn" class="login-secondary-btn" type="button">发送验证码</button>
                        </div>
                        <!-- 可选密码提示（仅邮箱模式显示） -->
                        <div id="optionalPasswordHint" style="margin-top:8px;">
                            <label class="login-label" for="loginOptionalPwdInput">
                                设置密码 <span style="font-weight:400;font-size:0.8em;color:#9ca3af;">(可选，设了以后可用密码登录)</span>
                            </label>
                            <input id="loginOptionalPwdInput" class="login-input" type="password"
                                   placeholder="留空则仅使用验证码登录" maxlength="64" autocomplete="new-password" />
                        </div>
                    </div>

                    <!-- 密码区域（默认隐藏） -->
                    <div id="passwordModeSection" style="display:none;">
                        <label class="login-label" for="loginPwdInput">密码</label>
                        <input id="loginPwdInput" class="login-input" type="password"
                               placeholder="请输入登录密码" maxlength="64" autocomplete="current-password" />
                    </div>

                    <!-- 模式切换按钮 -->
                    <button type="button" class="login-mode-switch" id="loginModeSwitch">
                        或使用密码登录 <span class="switch-arrow">▸</span>
                    </button>

                    <button id="loginSubmitBtn" class="login-primary-btn" type="button">
                        <span id="submitBtnText">验证码登录</span>
                    </button>

                    <button id="loginCancelBtn" class="login-ghost-btn" type="button">暂不登录，返回页面</button>

                    <div id="loginStatus" class="login-status"></div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    let authBar = document.getElementById('authStatusBar');
    if (!authBar) {
        authBar = document.createElement('div');
        authBar.id = 'authStatusBar';
        authBar.className = 'auth-status-bar hidden';
        authBar.innerHTML = `
            <div class="auth-status-main">
                <span class="auth-status-label">云端账户</span>
                <span class="auth-status-value" id="authStatusValue">未登录</span>
            </div>
            <button type="button" id="authLogoutBtn" class="auth-logout-btn">退出</button>
        `;
        const sidebarHeader = document.querySelector('.sidebar-header');
        sidebarHeader?.appendChild(authBar);
    }

    bindUiEvents();
    return overlay;
}


// ===== UI 状态管理 =====

function setStatus(message = '', type = '') {
    const status = document.getElementById('loginStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}

/**
 * 切换验证码/密码模式
 */
function switchLoginMode(mode) {
    currentMode = mode;

    const codeSection = document.getElementById('codeModeSection');
    const pwdSection = document.getElementById('passwordModeSection');
    const switchBtn = document.getElementById('loginModeSwitch');
    const submitText = document.getElementById('submitBtnText');

    if (mode === 'code') {
        codeSection.style.display = '';
        pwdSection.style.display = 'none';
        switchBtn.innerHTML = '或使用密码登录 <span class="switch-arrow">▸</span>';
        submitText.textContent = '验证码登录';
    } else {
        codeSection.style.display = 'none';
        pwdSection.style.display = '';
        switchBtn.innerHTML = '返回验证码登录 <span class="switch-arrow">◂</span>';
        submitText.textContent = '密码登录';
    }

    // 清空状态
    setStatus('');
}


// ===== 事件处理 =====

async function handleSendCode() {
    const account = document.getElementById('loginAccountInput')?.value || '';
    const btn = document.getElementById('sendCodeBtn');
    const inputType = detectInputType(account);

    // 输入校验
    if (inputType === 'unknown') {
        setStatus('请输入正确的邮箱地址或手机号', 'error');
        return;
    }

    try {
        setStatus('正在发送验证码…', 'pending');
        btn.disabled = true;
        btn.textContent = '发送中…';

        if (inputType === 'email') {
            await sendEmailCode(account);
            setStatus('验证码已发送，请查收邮箱后输入 6 位验证码。', 'success');
        } else {
            await sendSmsCode(account);
            setStatus('验证码已发送到手机，请注意查收短信。', 'success');
        }

        startCountdown(btn);
    } catch (error) {
        setStatus(error.message || '发送失败，请稍后重试。', 'error');
        btn.disabled = false;
        btn.textContent = '发送验证码';
    }
}

/** 发送验证码按钮倒计时（60s） */
function startCountdown(btn) {
    let seconds = 60;
    btn.disabled = true;
    const timer = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = '发送验证码';
            return;
        }
        btn.textContent = `${seconds}s 后重发`;
    }, 1000);
}

async function handleLogin() {
    const account = document.getElementById('loginAccountInput')?.value || '';
    const inputType = detectInputType(account);

    // 输入校验
    if (inputType === 'unknown') {
        setStatus('请输入正确的邮箱地址或手机号', 'error');
        return;
    }

    // 手机号不支持密码模式（目前）
    if (currentMode === 'password' && inputType === 'phone') {
        setStatus('手机号暂仅支持验证码登录，请切换到验证码模式', 'error');
        return;
    }

    try {
        setStatus('正在登录…', 'pending');

        let result;
        if (currentMode === 'code') {
            // 验证码模式 — 自动识别邮箱/手机号
            const code = (document.getElementById('loginCodeInput')?.value || '').trim();

            if (inputType === 'email') {
                const optionalPwd = (document.getElementById('loginOptionalPwdInput')?.value || '').trim();
                result = await emailCodeLogin(account, code, optionalPwd || undefined);
            } else {
                result = await smsLogin(account, code);
            }
        } else {
            // 密码模式（仅邮箱支持）
            const pwd = (document.getElementById('loginPwdInput')?.value || '').trim();
            result = await passwordLogin(account, pwd);
        }

        setStatus('✅ 登录成功，正在进入云端同步…', 'success');

        if (onLoginSuccess) {
            await onLoginSuccess(result?.user || null);
        }
    } catch (error) {
        setStatus(error.message || '登录失败，请稍后重试。', 'error');
    }
}

function bindUiEvents() {
    if (uiBound) return;

    const sendBtn = document.getElementById('sendCodeBtn');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const accountInput = document.getElementById('loginAccountInput');
    const accountLabel = document.getElementById('loginAccountLabel');
    const codeInput = document.getElementById('loginCodeInput');
    const pwdInput = document.getElementById('loginPwdInput');
    const optionalPwdHint = document.getElementById('optionalPasswordHint');
    const logoutBtn = document.getElementById('authLogoutBtn');
    const closeBtn = document.getElementById('loginCloseBtn');
    const cancelBtn = document.getElementById('loginCancelBtn');
    const modeSwitchBtn = document.getElementById('loginModeSwitch');
    const dismiss = () => hideLoginPage();

    sendBtn?.addEventListener('click', handleSendCode);
    submitBtn?.addEventListener('click', handleLogin);

    // 输入时实时更新标签文字 + 控制可选密码显示（仅邮箱模式）
    accountInput?.addEventListener('input', () => {
        const value = accountInput.value;
        const type = detectInputType(value);
        accountLabel.textContent = getAccountLabel(value);

        // 可选密码仅邮箱模式有意义，手机号模式隐藏
        if (optionalPwdHint) {
            optionalPwdHint.style.display = (type === 'phone') ? 'none' : '';
        }
    });

    // 回车键快捷操作
    accountInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (currentMode === 'code') handleSendCode();
            else pwdInput?.focus();
        }
    });
    codeInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); handleLogin(); }
    });
    pwdInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); handleLogin(); }
    });

    // 关闭/取消
    closeBtn?.addEventListener('click', dismiss);
    cancelBtn?.addEventListener('click', dismiss);

    // 模式切换
    modeSwitchBtn?.addEventListener('click', () => {
        switchLoginMode(currentMode === 'code' ? 'password' : 'code');
    });

    // ESC 关闭
    const overlay = document.getElementById('loginPage');
    overlay?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    });

    // 退出
    logoutBtn?.addEventListener('click', async () => {
        if (onLogout) await onLogout();
    });

    uiBound = true;
}


// ===== 对外接口 =====

export function setLoginSuccessHandler(handler) {
    onLoginSuccess = handler;
}

export function setLogoutHandler(handler) {
    onLogout = handler;
}

export function showLoginPage(message = '') {
    const overlay = ensureLoginUi();
    overlay.classList.remove('hidden');
    document.body.classList.add('auth-locked');

    // 每次打开重置为验证码模式
    switchLoginMode('code');

    if (message) {
        setStatus(message, 'info');
    } else {
        setStatus('');
    }
}

export function hideLoginPage() {
    const overlay = ensureLoginUi();
    overlay.classList.add('hidden');
    document.body.classList.remove('auth-locked');
    setStatus('');
}

/** 显示短暂自动消失的提示（不依赖外部 UI 框架） */
function showTransientToast(text, duration = 2500) {
    let toast = document.getElementById('loginTransientToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'loginTransientToast';
        toast.style.cssText =
            'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
            'background:#1a73e8;color:#fff;padding:10px 20px;border-radius:8px;' +
            'font-size:14px;z-index:99999;opacity:0;transition:opacity .3s;' +
            'pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.15);';
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(showTransientToast._timer);
    showTransientToast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

export function renderAuthStatus(user) {
    ensureLoginUi();
    const authBar = document.getElementById('authStatusBar');
    const value = document.getElementById('authStatusValue');
    if (value) value.textContent = user?.email || '已登录';
    authBar?.classList.remove('hidden');
}

export function clearAuthStatus() {
    const authBar = document.getElementById('authStatusBar');
    authBar?.classList.add('hidden');
}
