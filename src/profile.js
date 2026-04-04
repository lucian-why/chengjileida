import state from './store.js';
import { getProfiles, saveProfiles, getActiveProfileId, setActiveProfileId, createProfile, updateProfile, deleteProfile, getExams } from './storage.js';
import { showConfirmDialog, showToast } from './modal.js';

// 注入外部依赖
let _refreshAll = null;

export function setDependencies({ refreshAll }) {
    _refreshAll = refreshAll;
}

// ===== 档案 UI =====
export function renderProfileSwitcher() {
    const profiles = getProfiles();
    const activeId = getActiveProfileId();
    const select = document.getElementById('profileSelect');
    select.innerHTML = profiles.map((p, i) =>
        `<option value="${i}" ${p.id === activeId ? 'selected' : ''}>${p.name}</option>`
    ).join('');
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
                    <div class="profile-item-exams">${examCount} 条考试记录</div>
                </div>
                <div class="profile-item-actions" onclick="event.stopPropagation()">
                    <button class="share-profile-btn" onclick="openShareProfileReport(${i})" title="分享档案报告">📤 分享报告</button>
                    <div class="action-btns">
                        <button onclick="renameProfile(${i})" title="重命名">✎</button>
                        ${profiles.length > 1 ? `<button class="delete-profile-btn" onclick="confirmDeleteProfile(${i})" title="删除档案">🗑</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function switchToProfile(index) {
    const profiles = getProfiles();
    const id = profiles[index].id;
    // 已经是当前档案则不切换
    if (id === getActiveProfileId()) return;
    setActiveProfileId(id);
    renderProfileSwitcher();
    renderProfileManager();
    // 切换档案后，默认选中该档案下最新的考试
    const exams = getExams(id);
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
    // 找到对应的 profile-item，把名称替换为输入框
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
        ? `该档案下的 ${examCount} 条考试记录将一并删除，此操作不可撤销！`
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
            cancelAddProfile();  // 先恢复按钮
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
