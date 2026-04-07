import { getCurrentUser, initSupabase, isAdminUser, isAuthEnabled, onAuthStateChange, signOut } from './auth.js';
import { hideLoginPage, setLoginSuccessHandler, setLogoutHandler, showLoginPage } from './login-ui.js';
import { mountEncouragementAdminPage } from './encouragement-copy.js';

function getElements() {
    return {
        gateCard: document.getElementById('adminGateCard'),
        gateKicker: document.getElementById('adminGateKicker'),
        gateTitle: document.getElementById('adminGateTitle'),
        gateDesc: document.getElementById('adminGateDesc'),
        loginBtn: document.getElementById('adminLoginBtn'),
        logoutBtn: document.getElementById('adminLogoutBtn'),
        managerCard: document.getElementById('encouragementManagerCard')
    };
}

function renderAdminGate(user = null) {
    const { gateCard, gateKicker, gateTitle, gateDesc, loginBtn, logoutBtn, managerCard } = getElements();
    if (gateCard) gateCard.style.display = '';
    if (managerCard) managerCard.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';

    if (isAdminUser(user)) {
        if (gateCard) gateCard.style.display = 'none';
        if (managerCard) managerCard.style.display = '';
        if (logoutBtn) logoutBtn.style.display = '';
        mountEncouragementAdminPage();
        return;
    }

    if (user) {
        if (gateKicker) gateKicker.textContent = '当前账号没有权限';
        if (gateTitle) gateTitle.textContent = '这里只允许管理员进入';
        if (gateDesc) gateDesc.textContent = '你已经登录，但当前账号不是管理员。请退出后使用管理员账号重新登录。';
        if (loginBtn) loginBtn.textContent = '切换管理员登录';
        return;
    }

    if (gateKicker) gateKicker.textContent = '需要管理员登录';
    if (gateTitle) gateTitle.textContent = '请输入管理员账号后继续';
    if (gateDesc) gateDesc.textContent = '这是一个隐藏页面。只有管理员身份可以进入文案管理后台。';
    if (loginBtn) loginBtn.textContent = '登录后台';
}

function bindAdminEvents() {
    const { loginBtn, logoutBtn } = getElements();
    loginBtn?.addEventListener('click', () => {
        showLoginPage('请输入管理员账号和密码后进入后台。');
    });
    logoutBtn?.addEventListener('click', async () => {
        await signOut();
        hideLoginPage();
        renderAdminGate(null);
    });
}

export async function startAdminApp() {
    initSupabase();
    bindAdminEvents();

    setLoginSuccessHandler(async (user) => {
        hideLoginPage();
        renderAdminGate(user);
    });

    setLogoutHandler(async () => {
        await signOut();
        hideLoginPage();
        renderAdminGate(null);
    });

    if (isAuthEnabled()) {
        onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
                renderAdminGate(null);
                showLoginPage('请输入管理员账号和密码后进入后台。');
                return;
            }
            if (session?.user) {
                const user = await getCurrentUser();
                renderAdminGate(user);
            }
        });
    }

    const user = await getCurrentUser();
    renderAdminGate(user);

    if (!isAdminUser(user)) {
        showLoginPage(user ? '当前账号不是管理员，请切换为管理员登录。' : '请输入管理员账号和密码后进入后台。');
    }
}
