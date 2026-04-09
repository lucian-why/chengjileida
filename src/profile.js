import state from './store.js';
import { getProfiles, getActiveProfileId, setActiveProfileId, createProfile, updateProfile, deleteProfile, getExams } from './storage.js';
import { showConfirmDialog, showToast } from './modal.js';
import { checkLimit as checkVipLimit } from './vip.js';

let _refreshAll = null;
let _profileSwitcherBound = false;

export function setDependencies({ refreshAll }) {
    _refreshAll = refreshAll;
}

function closeProfileSwitcher() {
    const shell = document.getElementById('profileSelectShell');
    const trigger = document.getElementById('profileSelectTrigger');
    if (!shell || !trigger) return;
    shell.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
}

function toggleProfileSwitcher() {
    const shell = document.getElementById('profileSelectShell');
    const trigger = document.getElementById('profileSelectTrigger');
    if (!shell || !trigger) return;
    const willOpen = !shell.classList.contains('open');
    shell.classList.toggle('open', willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
}

function bindProfileSwitcherEvents() {
    if (_profileSwitcherBound) return;

    const trigger = document.getElementById('profileSelectTrigger');
    const menu = document.getElementById('profileSelectMenu');
    const shell = document.getElementById('profileSelectShell');
    if (!trigger || !menu || !shell) return;

    trigger.addEventListener('click', function(event) {
        event.stopPropagation();
        toggleProfileSwitcher();
    });

    menu.addEventListener('click', function(event) {
        const option = event.target.closest('[data-profile-index]');
        if (!option) return;
        switchToProfile(option.dataset.profileIndex);
        closeProfileSwitcher();
    });

    document.addEventListener('click', function(event) {
        if (!shell.contains(event.target)) {
            closeProfileSwitcher();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') closeProfileSwitcher();
    });

    _profileSwitcherBound = true;
}

export function renderProfileSwitcher() {
    const profiles = getProfiles();
    const activeId = getActiveProfileId();
    const activeProfile = profiles.find(profile => profile.id === activeId) || profiles[0] || null;
    const valueEl = document.getElementById('profileSelectValue');
    const metaEl = document.getElementById('profileSelectMeta');
    const menu = document.getElementById('profileSelectMenu');

    if (valueEl) valueEl.textContent = activeProfile ? activeProfile.name : '暂无档案';
    if (metaEl) metaEl.textContent = activeProfile ? `${getExams(activeProfile.id).length} 场考试` : '点击新建档案';

    if (menu) {
        menu.innerHTML = profiles.map((profile, index) => {
            const isActive = profile.id === activeId;
            const examCount = getExams(profile.id).length;
            return `
                <button type="button" class="profile-select-option ${isActive ? 'active' : ''}" data-profile-index="${index}" role="option" aria-selected="${isActive}">
                    <span class="profile-select-option-main">
                        <span class="profile-select-option-name">${profile.name}</span>
                        ${isActive ? '<span class="profile-select-option-badge">当前</span>' : ''}
                    </span>
                    <span class="profile-select-option-meta">${examCount} 场考试</span>
                </button>
            `;
        }).join('');
    }

    bindProfileSwitcherEvents();
}

export function renderProfileManager() {
    const profiles = getProfiles();
    const activeId = getActiveProfileId();
    const container = document.getElementById('profileList');

    if (profiles.length === 0) {
        container.innerHTML = '<div class="profile-empty">暂无档案</div>';
        return;
    }

    container.innerHTML = profiles.map((p, i) => {
        const examCount = getExams(p.id).length;
        return `
            <div class="profile-item" onclick="switchToProfile(${i})">
                <div class="profile-item-info">
                    <div class="profile-item-name">
                        ${p.name}
                        ${p.id === activeId ? '<span class="active-badge">当前</span>' : ''}
                    </div>
                    <div class="profile-item-exams">${examCount} 场考试记录</div>
                </div>
                <div class="profile-item-actions" onclick="event.stopPropagation()">
                    <button class="share-profile-btn" onclick="openShareProfileReport(${i})" title="分享档案报告">📤 分享报告</button>
                    <div class="action-btns">
                        <button onclick="renameProfile(${i})" title="重命名">✎</button>
                        ${profiles.length > 1 ? `<button class="delete-profile-btn" onclick="confirmDeleteProfile(${i})" title="删除档案">🗏</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function switchToProfile(index) {
    const profiles = getProfiles();
    const profile = profiles[Number(index)];
    if (!profile) return;

    if (profile.id === getActiveProfileId()) {
        closeProfileSwitcher();
        return;
    }

    setActiveProfileId(profile.id);
    renderProfileSwitcher();
    renderProfileManager();

    const exams = getExams(profile.id);
    if (exams.length > 0) {
        const sorted = [...exams].sort((a, b) => new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt));
        state.currentExamId = sorted[0].id;
    } else {
        state.currentExamId = null;
    }

    if (_refreshAll) _refreshAll();
}

export function renameProfile(index) {
    const profiles = getProfiles();
    const p = profiles[index];
    if (!p) return;

    const items = document.querySelectorAll('.profile-item');
    for (const item of items) {
        if (!item.getAttribute('onclick')?.includes(`switchToProfile(${index})`)) continue;
        const nameEl = item.querySelector('.profile-item-name');
        if (!nameEl) continue;
        nameEl.innerHTML = `<input type="text" class="rename-input" value="${p.name}" maxlength="20" style="flex:1;padding:4px 8px;border:1px solid var(--accent-blue);border-radius:6px;font-size:0.9rem;font-family:inherit;outline:none;">`;
        const input = nameEl.querySelector('input');
        input.focus();
        input.select();
        const finish = () => {
            const v = input.value.trim();
            if (v && v !== p.name) updateProfile(p.id, v);
            renderProfileSwitcher();
            renderProfileManager();
        };
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') finish();
            if (e.key === 'Escape') renderProfileManager();
        });
        input.addEventListener('blur', finish);
        break;
    }
}

export function confirmDeleteProfile(index) {
    const profiles = getProfiles();
    const p = profiles[index];
    if (!p) return;
    const examCount = getExams(p.id).length;
    const msg = examCount > 0
        ? `该档案下的 ${examCount} 场考试记录将一并删除，此操作不可撤销`
        : '此操作不可撤销';

    showConfirmDialog({
        icon: '🗑',
        title: `确定删除档案「${p.name}」？`,
        message: msg,
        okText: '删除',
        okClass: 'confirm-ok-btn',
        onConfirm: () => {
            deleteProfile(p.id);
            renderProfileSwitcher();
            renderProfileManager();
            if (_refreshAll) _refreshAll();
        }
    });
}

export function addNewProfile() {
    // 档案数量限制
    const currentProfiles = getProfiles();
    const profileCheck = checkVipLimit('profileCount', currentProfiles.length);
    if (!profileCheck.allowed) {
        showToast({
            icon: '🔒',
            iconType: 'warning',
            title: '档案数量已达上限',
            message: profileCheck.reason
        });
        return;
    }

    const area = document.getElementById('addProfileArea');
    area.innerHTML = `
        <div class="profile-inline-input">
            <input type="text" id="newProfileNameInput" placeholder="输入档案名称" maxlength="20">
            <button class="confirm-btn" id="confirmAddProfileBtn">确定</button>
            <button class="cancel-btn" id="cancelAddProfileBtn">取消</button>
        </div>
    `;
    const input = document.getElementById('newProfileNameInput');
    input.focus();
    const doAdd = () => {
        const name = input.value.trim();
        if (name) {
            const newId = createProfile(name);
            setActiveProfileId(newId);
            cancelAddProfile();
            renderProfileSwitcher();
            renderProfileManager();
            if (_refreshAll) _refreshAll();
        } else {
            cancelAddProfile();
        }
    };
    document.getElementById('confirmAddProfileBtn').addEventListener('click', doAdd);
    document.getElementById('cancelAddProfileBtn').addEventListener('click', cancelAddProfile);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doAdd();
        if (e.key === 'Escape') cancelAddProfile();
    });
}

export function cancelAddProfile() {
    const area = document.getElementById('addProfileArea');
    area.innerHTML = '<button class="btn-small" id="addProfileBtn" style="margin-top: 10px; background: var(--accent-green); color: #fff; border-color: var(--accent-green);">+ 新建档案</button>';
    document.getElementById('addProfileBtn').addEventListener('click', addNewProfile);
}
