/**
 * login-ui.js — 登录/注册 UI（密码优先模式）
 *
 * 职责：渲染登录弹窗、处理登录交互、显示登录状态、昵称编辑
 *
 * 设计方案（2026-04-06 重构）：
 *   密码优先 —— 默认手机号+密码登录，验证码作为备选
 *   - 统一输入框：自动识别用户输入的是邮箱还是手机号
 *     · 含 @ → 邮箱密码登录 / 邮箱验证码登录
 *     · 11位手机号 → 手机号密码登录（默认）/ 验证码登录（备选）
 *   - 新用户自动注册：密码登录失败(404) → 自动切换到注册面板
 *   - 注册流程：验证码 + 设置密码
 *   - 找回密码：独立面板，验证码+新密码
 *   - 昵称编辑：点击昵称即可修改（inline 弹窗）
 *
 * 依赖：
 *   - auth.js：sendEmailCode / sendSmsCode / emailCodeLogin / smsLogin / passwordLogin
 *            phonePasswordLogin / phoneRegisterFn / phoneResetPasswordFn / updateUserNickname
 */

import {
    sendEmailCode, sendSmsCode, emailLogin, emailCodeLogin, smsLogin, passwordLogin, resetPassword,
    phonePasswordLogin, phoneRegisterFn, phoneResetPasswordFn, updateUserNickname, verifyPhoneOtp, saveAuthSession
} from './auth.js';
import { isAdminUser } from './auth.js';
import QRCode from 'qrcode';
import { initTCB } from './cloud-tcb.js';

let qrcodeLoginWatcher = null;
let currentQrcodeUuid = null;

async function startQrcodeLogin() {
    stopQrcodeLogin();
    
    // 生成随机 UUID
    const uuid = 'qr_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    currentQrcodeUuid = uuid;
    
    const qrcodeContent = `score-radar-login:${uuid}`;
    const canvas = document.getElementById('loginQrcodeCanvas');
    const statusText = document.getElementById('qrcodeStatus');
    
    try {
        await QRCode.toCanvas(canvas, qrcodeContent, {
            width: 200,
            margin: 2,
            color: { dark: '#10a37f', light: '#ffffff' }
        });
        statusText.textContent = '请打开小程序扫码';
        
        // 监听数据库
        const app = await initTCB();
        const db = app.database();
        
        // 先插入一条 pending 状态的记录（网页端匿名登录下创建会拥有读写权限）
        try {
            await db.collection('web_login_sessions').add({
                uuid: uuid,
                status: 'pending',
                createTime: db.serverDate()
            });
        } catch(e) {
            console.warn('[QRCode] create session error', e);
            // 忽略创建失败，可能权限限制，直接依赖小程序的插入/更新
        }

        qrcodeLoginWatcher = db.collection('web_login_sessions').where({
            uuid: uuid
        }).watch({
            onChange: function(snapshot) {
                if (snapshot.docs.length > 0) {
                    const doc = snapshot.docs[0];
                    if (doc.status === 'confirmed' && doc.userId && doc.token) {
                        statusText.textContent = '授权成功！正在登录...';
                        stopQrcodeLogin();
                        
                        // 从 doc 中提取 user 和 token
                        const user = doc.user || { id: doc.userId, nickname: '扫码用户' };
                        const token = doc.token;
                        
                        saveAuthSession({ token, user });
                        
                        // 触发登录成功回调
                        if (onLoginSuccess) {
                            onLoginSuccess({ user, token });
                        }
                        hideLoginPage();
                    }
                }
            },
            onError: function(err) {
                console.error('[QRCode] watch error:', err);
            }
        });

    } catch (err) {
        console.error('[QRCode] generate error:', err);
        statusText.textContent = '二维码生成失败';
    }
}

function stopQrcodeLogin() {
    if (qrcodeLoginWatcher) {
        qrcodeLoginWatcher.close();
        qrcodeLoginWatcher = null;
    }
    currentQrcodeUuid = null;
}

let onLoginSuccess = null;
let onLogout = null;
let uiBound = false;

/** 当前登录模式：'code'(验证码) | 'password'(密码) */
let currentMode = 'password';

/** 登录子状态：'login'(默认) | 'register'(注册) | 'resetpwd'(找回密码) | 'sms_login'(验证码登录) */
let loginSubMode = 'login';

/**
 * 智能识别输入类型：email | phone | unknown
 */
function normalizeAccountInput(value) {
    const raw = String(value || '')
        .replace(/\u3000/g, ' ')
        .trim();

    const normalized = raw
        .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
        .replace(/＠/g, '@')
        .replace(/[。．｡]/g, '.')
        .replace(/[‐‑‒–—―－]/g, '-');

    return normalized.replace(/\s+/g, '');
}

function detectInputType(value) {
    const trimmed = normalizeAccountInput(value);
    if (trimmed.toLowerCase() === 'admin') return 'admin';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'email';
    if (/^1[3-9]\d{9}$/.test(trimmed)) return 'phone';
    return 'unknown';
}

/**
 * 根据当前输入返回友好的标签文字
 */
function getAccountLabel(value) {
    const type = detectInputType(value);
    if (type === 'admin') return '账号';
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
                    <div id="loginMainPanel">
                    <!-- 统一账号输入框 -->
                    <label class="login-label" id="loginAccountLabel" for="loginAccountInput">邮箱 / 手机号</label>
                    <input id="loginAccountInput" class="login-input" type="text"
                           placeholder="请输入邮箱或手机号" maxlength="100" autocomplete="username" />

                    <!-- 密码区域（默认展示） -->
                    <div id="passwordModeSection">
                        <label class="login-label" for="loginPwdInput">密码</label>
                        <div class="password-input-wrap">
                            <input id="loginPwdInput" class="login-input password-input" type="password"
                                   placeholder="请输入登录密码" maxlength="64" autocomplete="current-password" />
                            <button type="button" class="password-toggle-btn" data-target="loginPwdInput" aria-label="显示密码">👁</button>
                        </div>
                    </div>

                    <!-- 验证码区域（注册时展示 / 验证码登录模式展示） -->
                    <div id="codeModeSection" style="display:none;">
                        <label class="login-label" for="loginCodeInput">验证码</label>
                        <div class="login-inline-row">
                            <input id="loginCodeInput" class="login-input" type="text"
                                   inputmode="numeric" placeholder="请输入 6 位验证码" maxlength="6" />
                            <button id="sendCodeBtn" class="login-secondary-btn" type="button">发送验证码</button>
                        </div>

                    </div>

                    <!-- 模式切换提示 -->
                    <div id="modeSwitchHint" style="display:none; margin-top:8px; font-size:0.85rem; color:#e8a87c; text-align:center;"></div>

                    <button id="loginSubmitBtn" class="login-primary-btn" type="button">
                        <span id="submitBtnText">登录 / 注册</span>
                    </button>

                    <!-- 底部辅助操作 -->
                    <div class="login-footer-links">
                        <a href="javascript:void(0)" id="qrcodeLoginLink" class="login-link">💻 扫码登录</a>
                        <a href="javascript:void(0)" id="smsLoginLink" class="login-link">📨 验证码登录</a>
                        <a href="javascript:void(0)" id="registerLink" class="login-link">📝 注册账号</a>
                        <a href="javascript:void(0)" id="forgotPwdLink" class="login-link">忘记密码？</a>
                        <a href="javascript:void(0)" id="backToLoginFromRegister" class="login-link" style="display:none;">← 返回登录</a>
                    </div>
                    </div>

                    <!-- 扫码登录面板（默认隐藏） -->
                    <div id="qrcodeLoginPanel" style="display:none;">
                        <div class="reset-panel-shell" style="text-align: center;">
                            <div style="font-weight:600; font-size:0.95rem; margin-bottom:12px;">扫码登录</div>
                            <p style="font-size:0.85rem; color:#666; margin-bottom:16px;">请使用小程序“我的 - 扫码登录网页版”扫描下方二维码</p>
                            <div id="qrcodeContainer" style="margin: 0 auto 16px auto; background: #f7f9fa; padding: 16px; border-radius: 8px; display: inline-block;">
                                <canvas id="loginQrcodeCanvas"></canvas>
                            </div>
                            <p id="qrcodeStatus" style="font-size:0.85rem; color:#10a37f; margin-bottom:12px;"></p>
                            <a href="javascript:void(0)" id="backToLoginFromQrcode" class="login-link" style="display:inline-block; margin-top:8px;">← 返回登录</a>
                        </div>
                    </div>

                    <!-- 找回密码面板（默认隐藏） -->
                    <div id="resetPwdPanel" style="display:none;">
                        <div class="reset-panel-shell">
                            <div style="font-weight:600; font-size:0.95rem; margin-bottom:12px;">找回密码</div>
                            <label class="login-label" for="resetPwdAccount">邮箱 / 手机号</label>
                            <input id="resetPwdAccount" class="login-input" type="text" placeholder="请输入注册邮箱或手机号" maxlength="100" autocomplete="username" />

                            <label class="login-label" for="resetPwdCode" style="margin-top:8px;">验证码</label>
                            <div class="login-inline-row">
                                <input id="resetPwdCode" class="login-input" type="text" inputmode="numeric" placeholder="6位验证码" maxlength="6" />
                                <button id="resetSendCodeBtn" class="login-secondary-btn" type="button">发送验证码</button>
                            </div>

                            <label class="login-label" for="resetNewPwd" style="margin-top:8px;">新密码</label>
                            <div class="password-input-wrap">
                                <input id="resetNewPwd" class="login-input password-input" type="password" placeholder="至少6位" maxlength="64" />
                                <button type="button" class="password-toggle-btn" data-target="resetNewPwd" aria-label="显示密码">👁</button>
                            </div>

                            <label class="login-label" for="resetConfirmPwd" style="margin-top:8px;">确认新密码</label>
                            <div class="password-input-wrap">
                                <input id="resetConfirmPwd" class="login-input password-input" type="password" placeholder="再次输入" maxlength="64" />
                                <button type="button" class="password-toggle-btn" data-target="resetConfirmPwd" aria-label="显示密码">👁</button>
                            </div>

                            <button id="resetSubmitBtn" class="login-primary-btn" type="button" style="margin-top:12px;">确认重置</button>
                            <a href="javascript:void(0)" id="backToLoginLink" class="login-link" style="display:inline-block; margin-top:8px;">← 返回登录</a>
                        </div>
                    </div>

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
                <span class="auth-status-label" id="authStatusLabel">我的账号</span>
                <span class="auth-status-value" id="authStatusValue">未登录</span>
                <span class="auth-sync-status hidden" id="authSyncStatus"></span>
            </div>
            <button type="button" id="authLoginBtn" class="auth-login-btn hidden">登录</button>
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

function switchToRegisterWithAccount(account, inputType) {
    switchLoginMode('code', 'register');
    const accountInput = document.getElementById('loginAccountInput');
    const accountLabel = document.getElementById('loginAccountLabel');
    const pwdInput = document.getElementById('loginPwdInput');

    if (accountInput) accountInput.value = account;
    if (accountLabel) accountLabel.textContent = getAccountLabel(account);
    pwdInput?.focus();

    const targetName = inputType === 'phone' ? '手机号' : '邮箱';
    setStatus(`该${targetName}尚未注册，已为你切换到注册页面。请发送验证码后完成注册。`, 'info');
}

/**
 * 切换登录模式（支持四种子状态）
 */
function switchLoginMode(mode, subMode) {
    currentMode = mode; // 'password' | 'code'
    loginSubMode = subMode || 'login';

    const pwdSection = document.getElementById('passwordModeSection');
    const codeSection = document.getElementById('codeModeSection');
    const mainPanel = document.getElementById('loginMainPanel');
    const switchHint = document.getElementById('modeSwitchHint');
    const submitText = document.getElementById('submitBtnText');
    const smsLink = document.getElementById('smsLoginLink');
    const qrcodeLink = document.getElementById('qrcodeLoginLink');
    const forgotLink = document.getElementById('forgotPwdLink');
    const resetPanel = document.getElementById('resetPwdPanel');
    const qrcodePanel = document.getElementById('qrcodeLoginPanel');
    const registerLink = document.getElementById('registerLink');

    // 先隐藏独立面板
    if (resetPanel) resetPanel.style.display = 'none';
    if (qrcodePanel) qrcodePanel.style.display = 'none';
    if (mainPanel) mainPanel.style.display = '';

    if (subMode === 'qrcode') {
        if (mainPanel) mainPanel.style.display = 'none';
        if (qrcodePanel) {
            qrcodePanel.style.display = '';
            startQrcodeLogin();
        }
        setStatus('');
        return;
    }

    if (subMode === 'resetpwd') {
        // 找回密码模式：隐藏主登录表单，只显示独立找回页
        if (mainPanel) mainPanel.style.display = 'none';
        if (resetPanel) resetPanel.style.display = '';
        setStatus('');
        return;
    }

    if (subMode === 'register') {
        // 注册模式：显示验证码 + 单次密码输入
        pwdSection.style.display = '';
        codeSection.style.display = '';
        switchHint.style.display = 'none';
        submitText.textContent = '注 册';
        smsLink.style.display = 'none';
        if (qrcodeLink) qrcodeLink.style.display = 'none';
        forgotLink.style.display = 'none';
        if (registerLink) registerLink.style.display = 'none';
        // 显示返回登录链接
        const backRegLink = document.getElementById('backToLoginFromRegister');
        if (backRegLink) backRegLink.style.display = '';
    } else if (mode === 'code' && subMode === 'sms_login') {
        // 验证码登录模式
        pwdSection.style.display = 'none';
        codeSection.style.display = '';
        switchHint.style.display = 'none';
        submitText.textContent = '验证码登录';
        smsLink.textContent = '🔑 密码登录';
        smsLink.style.display = '';
        if (qrcodeLink) qrcodeLink.style.display = 'none';
        forgotLink.style.display = 'none';
        if (registerLink) registerLink.style.display = 'none';
        // 验证码登录也显示返回
        const backSmsLink = document.getElementById('backToLoginFromRegister');
        if (backSmsLink) backSmsLink.style.display = '';
    } else {
        // 默认密码登录模式
        pwdSection.style.display = '';
        codeSection.style.display = 'none';
        switchHint.style.display = 'none';
        submitText.textContent = '登录 / 注册';
        smsLink.textContent = '📨 验证码登录';
        smsLink.style.display = '';
        if (qrcodeLink) qrcodeLink.style.display = '';
        forgotLink.style.display = ''; // 手机号模式显示忘记密码
        if (registerLink) registerLink.style.display = '';
        // 隐藏注册模式的返回链接
        const backRegLink2 = document.getElementById('backToLoginFromRegister');
        if (backRegLink2) backRegLink2.style.display = 'none';
    }

    setStatus('');
}


// ===== 事件处理 =====

async function handleSendCode(targetBtn) {
    const btn = targetBtn || document.getElementById('sendCodeBtn');
    const account = normalizeAccountInput(document.getElementById('loginAccountInput')?.value || '');
    const inputType = detectInputType(account);

    if (inputType === 'admin') {
        setStatus('该账号不支持验证码登录', 'error');
        return;
    }

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
    const account = normalizeAccountInput(document.getElementById('loginAccountInput')?.value || '');
    const inputType = detectInputType(account);

    if (inputType === 'unknown') {
        setStatus('请输入正确的邮箱地址或手机号', 'error');
        return;
    }

    try {
        if (loginSubMode === 'register') {
            // ---- 注册模式：验证码 + 密码 ----
            await handleRegister(account, inputType);
        } else if (currentMode === 'code' || loginSubMode === 'sms_login') {
            // ---- 验证码登录模式 ----
            await handleCodeLogin(account, inputType);
        } else {
            // ---- 默认密码登录模式 ----
            await handlePasswordLogin(account, inputType);
        }
    } catch (error) {
        // 处理 NOT_REGISTERED 特殊错误 → 自动切到注册模式
        if (error.code === 'NOT_REGISTERED' || error.registered === false) {
            switchToRegisterWithAccount(account, inputType);
            return;
        }

        // 处理 402（账号存在但未设置密码）→ 引导设密码
        if (error.message && error.message.includes('尚未设置密码')) {
            setStatus('该账号尚未设置密码，可通过「忘记密码」设置新密码', 'info');
            // 显示忘记密码链接
            const forgotLink = document.getElementById('forgotPwdLink');
            if (forgotLink) forgotLink.style.display = '';
            return;
        }
        setStatus(error.message || '登录失败，请稍后重试。', 'error');
    }
}

async function handlePasswordLogin(account, inputType) {
    const pwd = (document.getElementById('loginPwdInput')?.value || '').trim();

    if (!pwd) {
        setStatus('请输入密码', 'error');
        return;
    }

    if (inputType === 'phone') {
        // 手机号密码登录（新功能）
        setStatus('正在登录…', 'pending');
        const result = await phonePasswordLogin(account, pwd);
        setStatus('✅ 登录成功，正在进入…', 'success');
        if (onLoginSuccess) await onLoginSuccess(result?.user || null);
    } else {
        // 邮箱密码登录（原有功能）
        setStatus('正在登录…', 'pending');
        const result = await passwordLogin(account, pwd);
        setStatus('✅ 登录成功，正在进入…', 'success');
        if (onLoginSuccess) await onLoginSuccess(result?.user || null);
    }
}

async function handleCodeLogin(account, inputType) {
    if (inputType === 'admin') {
        setStatus('该账号仅支持密码登录', 'error');
        return;
    }

    const code = (document.getElementById('loginCodeInput')?.value || '').trim();

    if (!code || !/^\d{6}$/.test(code)) {
        setStatus('请输入6位验证码', 'error');
        return;
    }

    setStatus('正在登录…', 'pending');
    let result;

    if (inputType === 'phone') {
        result = await smsLogin(account, code);
    } else {
        result = await emailLogin(account, code);
    }

    setStatus('✅ 登录成功，正在进入…', 'success');
    if (onLoginSuccess) await onLoginSuccess(result?.user || null);
}

async function handleRegister(account, inputType) {
    if (inputType === 'admin') {
        setStatus('该账号不支持注册', 'error');
        return;
    }

    const code = (document.getElementById('loginCodeInput')?.value || '').trim();
    const pwd = (document.getElementById('loginPwdInput')?.value || '').trim();

    if (!code || !/^\d{6}$/.test(code)) {
        setStatus('请输入6位验证码', 'error');
        return;
    }
    if (!pwd || pwd.length < 6) {
        setStatus('请设置至少6位的密码', 'error');
        return;
    }

    setStatus('正在注册…', 'pending');

    if (inputType === 'phone') {
        await verifyPhoneOtp(account, code);
        const result = await phoneRegisterFn(account, '', pwd, { verified: true });
        setStatus('✅ 注册成功，正在进入…', 'success');
        if (onLoginSuccess) await onLoginSuccess(result?.user || null);
    } else {
        // 邮箱注册走原有的 emailCodeLogin（带密码参数）
        const result = await emailCodeLogin(account, code, pwd);
        setStatus('✅ 注册成功，正在进入…', 'success');
        if (onLoginSuccess) await onLoginSuccess(result?.user || null);
    }
}

/** 找回密码处理 */
async function handleResetPassword() {
    const account = normalizeAccountInput(document.getElementById('resetPwdAccount')?.value || '');
    const inputType = detectInputType(account);
    const code = (document.getElementById('resetPwdCode')?.value || '').trim();
    const newPwd = (document.getElementById('resetNewPwd')?.value || '').trim();
    const confirmPwd = (document.getElementById('resetConfirmPwd')?.value || '').trim();

    if (inputType === 'unknown') {
        setStatus('请输入正确的邮箱地址或手机号', 'error'); return;
    }
    if (!/^\d{6}$/.test(code)) {
        setStatus('请输入6位验证码', 'error'); return;
    }
    if (newPwd.length < 6) {
        setStatus('密码至少需要6个字符', 'error'); return;
    }
    if (newPwd !== confirmPwd) {
        setStatus('两次输入的密码不一致', 'error'); return;
    }

    try {
        setStatus('正在重置…', 'pending');
        if (inputType === 'phone') {
            await verifyPhoneOtp(account, code);
            await phoneResetPasswordFn(account, '', newPwd, { verified: true });
        } else {
            await resetPassword(account, code, newPwd);
        }
        setStatus('✅ 密码重置成功', 'success');
        setTimeout(() => {
            switchLoginMode('password', 'login');
            showTransientToast('密码已重置，请使用新密码登录');
        }, 1500);
    } catch (error) {
        setStatus(error.message || '重置失败', 'error');
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
    const loginBtn = document.getElementById('authLoginBtn');
    const logoutBtn = document.getElementById('authLogoutBtn');
    const closeBtn = document.getElementById('loginCloseBtn');
    const dismiss = () => hideLoginPage();

    // 底部链接
    const smsLink = document.getElementById('smsLoginLink');
    const forgotLink = document.getElementById('forgotPwdLink');
    const registerLink = document.getElementById('registerLink');

    // 找回密码面板元素
    const resetSendCodeBtn = document.getElementById('resetSendCodeBtn');
    const resetSubmitBtn = document.getElementById('resetSubmitBtn');
    const backToLoginLink = document.getElementById('backToLoginLink');

    sendBtn?.addEventListener('click', () => handleSendCode(sendBtn));
    submitBtn?.addEventListener('click', handleLogin);

    // 输入时实时更新标签文字
    accountInput?.addEventListener('input', () => {
        const value = accountInput.value;
        accountLabel.textContent = getAccountLabel(value);
        // 手机号模式下显示忘记密码链接（仅在密码登录模式）
        const type = detectInputType(value);
        if (forgotLink) {
            forgotLink.style.display = (type === 'phone' && currentMode === 'password' && loginSubMode === 'login') ? '' : 'none';
        }
    });

    // 回车键快捷操作
    accountInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (currentMode === 'code' || loginSubMode !== 'login') handleSendCode(sendBtn);
            else pwdInput?.focus();
        }
    });
    codeInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); handleLogin(); }
    });
    pwdInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); handleLogin(); }
    });

    // 关闭
    closeBtn?.addEventListener('click', dismiss);

    document.querySelectorAll('.password-toggle-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) return;

            const showing = input.type === 'text';
            input.type = showing ? 'password' : 'text';
            button.textContent = showing ? '👁' : '🙈';
            button.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
        });
    });

    // 💻 扫码登录
    const qrcodeLink = document.getElementById('qrcodeLoginLink');
    qrcodeLink?.addEventListener('click', () => {
        switchLoginMode('qrcode', 'qrcode');
    });

    // ← 返回登录（扫码登录面板）
    const backToLoginFromQrcode = document.getElementById('backToLoginFromQrcode');
    backToLoginFromQrcode?.addEventListener('click', () => {
        stopQrcodeLogin();
        switchLoginMode('password', 'login');
    });

    // 📨 验证码登录 / 🔑 密码登录 切换
    smsLink?.addEventListener('click', () => {
        if (loginSubMode === 'sms_login') {
            // 当前在验证码模式 → 切回密码模式
            switchLoginMode('password', 'login');
        } else {
            // 当前在密码模式 → 切到验证码登录
            switchLoginMode('code', 'sms_login');
        }
    });

    // 忘记密码？→ 切换到找回密码面板
    forgotLink?.addEventListener('click', () => {
        switchLoginMode('password', 'resetpwd');
    });

    // 📝 注册账号 → 切换到注册模式，不再自动发送验证码
    registerLink?.addEventListener('click', async () => {
        const accountInput = document.getElementById('loginAccountInput');
        const account = normalizeAccountInput(accountInput?.value || '');
        const type = detectInputType(account);

        // 先切到注册模式
        switchLoginMode('code', 'register');

        if (type === 'unknown') {
            setStatus('请输入手机号或邮箱以开始注册', 'info');
            accountInput?.focus();
            return;
        }

        setStatus(`已切换到注册模式，请点击发送验证码并设置密码完成注册。`, 'info');
    });

    // ← 返回登录（找回密码面板）
    backToLoginLink?.addEventListener('click', () => {
        switchLoginMode('password', 'login');
    });

    // ← 返回登录（注册模式）
    const backToLoginFromReg = document.getElementById('backToLoginFromRegister');
    backToLoginFromReg?.addEventListener('click', () => {
        switchLoginMode('password', 'login');
    });

    // 找回密码面板：发送验证码
    resetSendCodeBtn?.addEventListener('click', () => {
        const account = normalizeAccountInput(document.getElementById('resetPwdAccount')?.value || '');
        const inputType = detectInputType(account);
        if (inputType === 'unknown') {
            setStatus('请输入正确的邮箱地址或手机号', 'error'); return;
        }
        if (inputType === 'admin') {
            setStatus('该账号不支持找回密码', 'error'); return;
        }
        (async () => {
            try {
                setStatus('正在发送验证码…', 'pending');
                resetSendCodeBtn.disabled = true;
                resetSendCodeBtn.textContent = '发送中…';
                if (inputType === 'phone') {
                    await sendSmsCode(account);
                    setStatus('验证码已发送到手机，请注意查收短信。', 'success');
                } else {
                    await sendEmailCode(account);
                    setStatus('验证码已发送，请查收邮箱后输入 6 位验证码。', 'success');
                }
                startCountdown(resetSendCodeBtn);
            } catch (error) {
                setStatus(error.message || '发送失败，请稍后重试。', 'error');
                resetSendCodeBtn.disabled = false;
                resetSendCodeBtn.textContent = '发送验证码';
            }
        })();
    });

    // 找回密码面板：提交重置
    resetSubmitBtn?.addEventListener('click', handleResetPassword);

    // ESC 关闭
    const overlay = document.getElementById('loginPage');
    overlay?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    });

    loginBtn?.addEventListener('click', () => {
        showLoginPage('登录后可启用云端备份与多端同步。');
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

    // 每次打开默认使用密码模式（而非验证码）
    switchLoginMode('password', 'login');

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

/** 显示短暂自动消失的提示 */
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

/** 渲染登录后的用户状态栏（含昵称点击编辑） */
export function renderAuthStatus(user) {
    ensureLoginUi();
    const authBar = document.getElementById('authStatusBar');
    const label = document.getElementById('authStatusLabel');
    const value = document.getElementById('authStatusValue');
    const loginBtn = document.getElementById('authLoginBtn');
    const logoutBtn = document.getElementById('authLogoutBtn');

    const displayText = user?.nickname || user?.email || user?.phone || '已登录';
    const adminMode = isAdminUser(user);
    authBar?.classList.remove('guest');
    authBar?.classList.add('logged-in');
    if (label) {
        label.textContent = adminMode ? '管理员身份' : '点击修改昵称';
        label.classList.remove('hidden');
    }
    if (value) {
        value.textContent = displayText;
        value.style.cursor = adminMode ? 'default' : 'pointer';
        value.title = adminMode ? '' : '点击修改昵称';
        value.onclick = adminMode ? null : (() => openNicknameEditor(user, displayText));
    }
    loginBtn?.classList.add('hidden');
    logoutBtn?.classList.remove('hidden');
    authBar?.classList.remove('hidden');
}

export function renderGuestAuthStatus() {
    ensureLoginUi();
    const authBar = document.getElementById('authStatusBar');
    const label = document.getElementById('authStatusLabel');
    const value = document.getElementById('authStatusValue');
    const loginBtn = document.getElementById('authLoginBtn');
    const logoutBtn = document.getElementById('authLogoutBtn');

    authBar?.classList.remove('logged-in');
    authBar?.classList.add('guest');
    if (label) {
        label.textContent = '';
        label.classList.add('hidden');
    }
    if (value) {
        value.textContent = '未登录';
        value.style.cursor = 'default';
        value.title = '';
        value.onclick = null;
    }
    loginBtn?.classList.remove('hidden');
    logoutBtn?.classList.add('hidden');
    authBar?.classList.remove('hidden');
    setAuthSyncStatus('', '', false);
}

/** 打开昵称编辑弹窗 */
function openNicknameEditor(user, currentNickname) {
    const editor = document.createElement('div');
    editor.id = 'nicknameEditor';
    editor.innerHTML = `
        <div class="nickname-editor-overlay" id="nicknameOverlay"
             style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99998;
                    background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
            <div class="nickname-editor-card"
                 style="background:#fff;border-radius:12px;padding:20px;width:320px;max-width:90vw;
                        box-shadow:0 8px 32px rgba(0,0,0,0.15);position:relative;z-index:99999;">
                <div style="font-weight:600;font-size:1rem;margin-bottom:12px;">✏️ 修改显示昵称</div>
                <input id="nicknameInputField" type="text" maxlength="20"
                       style="width:100%;padding:10px 12px;border:1px solid #e8e4de;border-radius:8px;
                              font-size:14px;box-sizing:border-box;outline:none;"
                       placeholder="输入新昵称" value="${currentNickname || ''}" />
                <div style="display:flex;gap:8px;margin-top:16px;">
                    <button id="nicknameCancelBtn" type="button"
                         style="flex:1;padding:8px;border:1px solid #e8e4de;border-radius:8px;
                                background:#fff;cursor:pointer;font-size:14px;">取消</button>
                    <button id="nicknameSaveBtn" type="button"
                         style="flex:1;padding:8px;border:none;border-radius:8px;
                                background:#4f46e5;color:#fff;cursor:pointer;font-size:14px;">保存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(editor);

    const overlay = document.getElementById('nicknameOverlay');
    const input = document.getElementById('nicknameInputField');
    const cancelBtn = document.getElementById('nicknameCancelBtn');
    const saveBtn = document.getElementById('nicknameSaveBtn');

    const close = () => { editor.remove(); };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    cancelBtn.onclick = close;
    input?.focus();

    saveBtn.onclick = async () => {
        const newName = (input?.value || '').trim();
        if (!newName) {
            input.style.borderColor = '#ef4444';
            return;
        }

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中…';
            await updateUserNickname(user.id, newName);
            close();
            if (user) user.nickname = newName;
            renderAuthStatus(user);
            showTransientToast('昵称已更新 ✓');
        } catch (err) {
            showTransientToast(err.message || '保存失败');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
    };

    const escHandler = (e) => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
}

export function clearAuthStatus() {
    const authBar = document.getElementById('authStatusBar');
    const label = document.getElementById('authStatusLabel');
    const value = document.getElementById('authStatusValue');
    const loginBtn = document.getElementById('authLoginBtn');
    const logoutBtn = document.getElementById('authLogoutBtn');

    authBar?.classList.remove('guest', 'logged-in');
    if (label) {
        label.textContent = '';
        label.classList.add('hidden');
    }
    if (value) {
        value.onclick = null;
        value.title = '';
        value.style.cursor = 'default';
    }
    loginBtn?.classList.add('hidden');
    logoutBtn?.classList.remove('hidden');
    authBar?.classList.add('hidden');
    setAuthSyncStatus('', '', false);
}

export function setAuthSyncStatus(message = '', type = '', visible = true) {
    const syncStatus = document.getElementById('authSyncStatus');
    if (!syncStatus) return;
    syncStatus.textContent = message;
    syncStatus.dataset.type = type;
    if (!visible || !message) {
        syncStatus.classList.add('hidden');
        return;
    }
    syncStatus.classList.remove('hidden');
}
