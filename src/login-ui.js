import { sendSmsCode, signInWithPhone } from './auth.js';

let onLoginSuccess = null;
let onLogout = null;
let uiBound = false;
let cooldownTimer = null;
let cooldownSeconds = 0;

function ensureLoginUi() {
    let overlay = document.getElementById('loginPage');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loginPage';
        overlay.className = 'login-page hidden';
        overlay.innerHTML = `
            <div class="login-card">
                <div class="login-logo">成绩雷达</div>
                <p class="login-subtitle">登录后可启用云端保存与多端同步</p>
                <div class="login-method-note">当前阶段先开放手机号验证码登录</div>
                <div class="login-form">
                    <label class="login-label" for="loginPhoneInput">手机号</label>
                    <input id="loginPhoneInput" class="login-input" type="tel" placeholder="请输入 11 位手机号" maxlength="15" />
                    <label class="login-label" for="loginCodeInput">验证码</label>
                    <div class="login-code-row">
                        <input id="loginCodeInput" class="login-input" type="text" placeholder="请输入短信验证码" maxlength="8" />
                        <button id="sendSmsBtn" class="login-secondary-btn" type="button">获取验证码</button>
                    </div>
                    <button id="loginSubmitBtn" class="login-primary-btn" type="button">登录</button>
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

function setStatus(message = '', type = '') {
    const status = document.getElementById('loginStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}

function setSendButtonState() {
    const button = document.getElementById('sendSmsBtn');
    if (!button) return;

    if (cooldownSeconds > 0) {
        button.disabled = true;
        button.textContent = `${cooldownSeconds}s`;
    } else {
        button.disabled = false;
        button.textContent = '获取验证码';
    }
}

function startCooldown() {
    cooldownSeconds = 60;
    setSendButtonState();
    clearInterval(cooldownTimer);
    cooldownTimer = window.setInterval(() => {
        cooldownSeconds -= 1;
        if (cooldownSeconds <= 0) {
            cooldownSeconds = 0;
            clearInterval(cooldownTimer);
        }
        setSendButtonState();
    }, 1000);
}

async function handleSendSms() {
    const phone = document.getElementById('loginPhoneInput')?.value || '';
    try {
        setStatus('正在发送验证码…', 'pending');
        await sendSmsCode(phone);
        startCooldown();
        setStatus('验证码已发送，请注意查收短信。', 'success');
    } catch (error) {
        setStatus(error.message || '验证码发送失败，请稍后重试。', 'error');
    }
}

async function handleLogin() {
    const phone = document.getElementById('loginPhoneInput')?.value || '';
    const code = document.getElementById('loginCodeInput')?.value || '';

    try {
        setStatus('正在登录…', 'pending');
        const user = await signInWithPhone(phone, code);
        setStatus('登录成功，正在进入成绩雷达…', 'success');
        if (onLoginSuccess) {
            await onLoginSuccess(user);
        }
    } catch (error) {
        setStatus(error.message || '登录失败，请检查验证码后重试。', 'error');
    }
}

function bindUiEvents() {
    if (uiBound) return;

    const overlay = document.getElementById('loginPage');
    const sendBtn = document.getElementById('sendSmsBtn');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const codeInput = document.getElementById('loginCodeInput');
    const phoneInput = document.getElementById('loginPhoneInput');
    const logoutBtn = document.getElementById('authLogoutBtn');

    sendBtn?.addEventListener('click', handleSendSms);
    submitBtn?.addEventListener('click', handleLogin);
    codeInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleLogin();
        }
    });
    phoneInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSendSms();
        }
    });
    overlay?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
        }
    });
    logoutBtn?.addEventListener('click', async () => {
        if (onLogout) {
            await onLogout();
        }
    });

    uiBound = true;
}

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

export function renderAuthStatus(user) {
    ensureLoginUi();
    const authBar = document.getElementById('authStatusBar');
    const value = document.getElementById('authStatusValue');
    if (value) {
        value.textContent = user?.phone || user?.email || '已登录';
    }
    authBar?.classList.remove('hidden');
}

export function clearAuthStatus() {
    const authBar = document.getElementById('authStatusBar');
    authBar?.classList.add('hidden');
}
