import state from './store.js';
import { getExams, getExamsAll, getActiveProfileId, saveExams, migrateProfilesIfNeeded } from './storage.js';
import { showConfirmDialog, showToast } from './modal.js';

let _refreshAll = null;

export function setDependencies({ refreshAll }) {
    _refreshAll = refreshAll;
}

export function setupDemoBtn() {
    document.getElementById('demoBtn').addEventListener('click', async function() {
        if (getExams(getActiveProfileId()).length > 0) {
            showConfirmDialog({
                icon: '📚',
                iconType: 'info',
                title: '添加示例数据？',
                message: '已有数据，继续添加会把示例考试追加到当前档案中。',
                okText: '添加',
                okClass: 'confirm-ok-btn blue',
                onConfirm: addDemoData
            });
        } else {
            await addDemoData();
        }
    });
}

export async function addDemoData(options = {}) {
    const { silent = false } = options;
    const profileId = getActiveProfileId();
    const demoExams = [
        {
            id: 'demo_20250315',
            profileId,
            name: '2025年3月月考',
            startDate: '2025-03-15',
            endDate: '2025-03-16',
            subjects: [
                { name: '语文', score: 45, fullScore: 100, classRank: 34, gradeRank: 260 },
                { name: '数学', score: 50, fullScore: 100, classRank: 28, gradeRank: 200 },
                { name: '英语', score: 40, fullScore: 100, classRank: 36, gradeRank: 270 },
                { name: '物理', score: 42, fullScore: 100, classRank: 35, gradeRank: 255 },
                { name: '化学', score: 48, fullScore: 100, classRank: 30, gradeRank: 225 },
                { name: '生物', score: 44, fullScore: 100, classRank: 32, gradeRank: 245 }
            ],
            totalClassRank: 28,
            totalGradeRank: 168,
            classTotal: 45,
            gradeTotal: 500,
            createdAt: new Date('2025-03-16').toISOString()
        },
        {
            id: 'demo_20250510',
            profileId,
            name: '2025年5月月考',
            startDate: '2025-05-10',
            endDate: '2025-05-11',
            subjects: [
                { name: '语文', score: 52, fullScore: 100, classRank: 26, gradeRank: 210 },
                { name: '数学', score: 58, fullScore: 100, classRank: 22, gradeRank: 178 },
                { name: '英语', score: 48, fullScore: 100, classRank: 30, gradeRank: 240 },
                { name: '物理', score: 45, fullScore: 100, classRank: 34, gradeRank: 260 },
                { name: '化学', score: 55, fullScore: 100, classRank: 24, gradeRank: 185 },
                { name: '生物', score: 50, fullScore: 100, classRank: 28, gradeRank: 205 }
            ],
            totalClassRank: 24,
            totalGradeRank: 148,
            classTotal: 45,
            gradeTotal: 500,
            createdAt: new Date('2025-05-11').toISOString()
        },
        {
            id: 'demo_20250620',
            profileId,
            name: '2025年6月期末考',
            startDate: '2025-06-20',
            endDate: '2025-06-22',
            subjects: [
                { name: '语文', score: 60, fullScore: 100, classRank: 20, gradeRank: 165 },
                { name: '数学', score: 65, fullScore: 100, classRank: 16, gradeRank: 140 },
                { name: '英语', score: 52, fullScore: 100, classRank: 27, gradeRank: 230 },
                { name: '物理', score: 50, fullScore: 100, classRank: 28, gradeRank: 210 },
                { name: '化学', score: 62, fullScore: 100, classRank: 18, gradeRank: 145 },
                { name: '生物', score: 55, fullScore: 100, classRank: 24, gradeRank: 178 }
            ],
            totalClassRank: 18,
            totalGradeRank: 125,
            classTotal: 45,
            gradeTotal: 500,
            createdAt: new Date('2025-06-22').toISOString()
        },
        {
            id: 'demo_20250715',
            profileId,
            name: '2025年7月月考',
            startDate: '2025-07-15',
            endDate: '2025-07-16',
            subjects: [
                { name: '语文', score: 55, fullScore: 100, classRank: 24, gradeRank: 195 },
                { name: '数学', score: 60, fullScore: 100, classRank: 20, gradeRank: 168 },
                { name: '英语', score: 45, fullScore: 100, classRank: 33, gradeRank: 255 },
                { name: '物理', score: 48, fullScore: 100, classRank: 30, gradeRank: 230 },
                { name: '化学', score: 58, fullScore: 100, classRank: 22, gradeRank: 190 },
                { name: '生物', score: 50, fullScore: 100, classRank: 28, gradeRank: 205 }
            ],
            totalClassRank: 22,
            totalGradeRank: 142,
            classTotal: 45,
            gradeTotal: 500,
            createdAt: new Date('2025-07-16').toISOString()
        },
        {
            id: 'demo_20250915',
            profileId,
            name: '2025年9月月考',
            startDate: '2025-09-15',
            endDate: '2025-09-16',
            excluded: true,
            subjects: [
                { name: '语文', score: 42, fullScore: 100, classRank: 35, gradeRank: 255 },
                { name: '数学', score: 45, fullScore: 100, classRank: 32, gradeRank: 235 },
                { name: '英语', score: 38, fullScore: 100, classRank: 38, gradeRank: 265 },
                { name: '物理', score: 35, fullScore: 100, classRank: 40, gradeRank: 280 },
                { name: '化学', score: 44, fullScore: 100, classRank: 33, gradeRank: 240 },
                { name: '生物', score: 40, fullScore: 100, classRank: 36, gradeRank: 258 }
            ],
            totalClassRank: 30,
            totalGradeRank: 180,
            classTotal: 45,
            gradeTotal: 500,
            createdAt: new Date('2025-09-16').toISOString()
        },
        {
            id: 'demo_20251110',
            profileId,
            name: '2025年11月期中考',
            startDate: '2025-11-10',
            endDate: '2025-11-11',
            subjects: [
                { name: '语文', score: 95, fullScore: 100, classRank: 2, gradeRank: 15 },
                { name: '数学', score: 50, fullScore: 100, classRank: 25, gradeRank: 145 },
                { name: '英语', score: 55, fullScore: 100, classRank: 28, gradeRank: 175 },
                { name: '物理', score: 48, fullScore: 100, classRank: 32, gradeRank: 200 },
                { name: '化学', score: 50, fullScore: 100, classRank: 28, gradeRank: 170 },
                { name: '生物', score: 60, fullScore: 100, classRank: 20, gradeRank: 130 }
            ],
            totalClassRank: 14,
            totalGradeRank: 85,
            classTotal: 45,
            gradeTotal: 500,
            createdAt: new Date('2025-11-11').toISOString()
        },
        {
            id: 'demo_20260320',
            profileId,
            name: '2026年3月模拟考',
            startDate: '2026-03-20',
            endDate: '2026-03-21',
            subjects: [
                { name: '语文', score: 70, fullScore: 100, classRank: 15, gradeRank: 105 },
                { name: '数学', score: 95, fullScore: 100, classRank: 1, gradeRank: 8 },
                { name: '英语', score: 80, fullScore: 100, classRank: 8, gradeRank: 68 },
                { name: '物理', score: 95, fullScore: 100, classRank: 2, gradeRank: 10 },
                { name: '化学', score: 78, fullScore: 100, classRank: 10, gradeRank: 75 },
                { name: '生物', score: 88, fullScore: 100, classRank: 4, gradeRank: 30 }
            ],
            totalClassRank: 5,
            totalGradeRank: 42,
            classTotal: 45,
            gradeTotal: 500,
            createdAt: new Date('2026-03-21').toISOString()
        }
    ];

    const demoIds = new Set(demoExams.map(exam => exam.id));
    let exams = getExamsAll();
    exams = exams.filter(exam => !demoIds.has(exam.id)).concat(demoExams);
    await saveExams(exams);

    state.currentExamId = demoExams[0].id;
    if (_refreshAll) await _refreshAll();

    if (!silent) {
        showToast({ icon: '🎉', title: '添加成功', message: '已添加 7 场考试示例数据（含排名信息）' });
    }
}

export async function checkFirstLaunch() {
    migrateProfilesIfNeeded();
    if (localStorage.getItem('xueji_hasLaunched')) return;
    const exams = getExams(getActiveProfileId());
    if (exams.length > 0) return;
    localStorage.setItem('xueji_hasLaunched', 'true');
    await addDemoData({ silent: true });
}
