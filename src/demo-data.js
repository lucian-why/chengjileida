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
            id: 'demo_20120618',
            profileId,
            name: '小升初考试',
            startDate: '2012-06-18',
            endDate: '2012-06-18',
            subjects: [
                { name: '语文', score: 90, fullScore: 100, classRank: 5, gradeRank: 24 },
                { name: '数学', score: 100, fullScore: 100, classRank: 1, gradeRank: 8 },
                { name: '英语', score: 93, fullScore: 100, classRank: 4, gradeRank: 19 }
            ],
            totalClassRank: 2,
            totalGradeRank: 15,
            classTotal: 42,
            gradeTotal: 320,
            notes: '那时候觉得考上好初中，就像人生已经赢了一半。回头看，原来只是第一次认真和世界打招呼。',
            createdAt: new Date('2012-06-18').toISOString()
        },
        {
            id: 'demo_20180625',
            profileId,
            name: '中招考试',
            startDate: '2018-06-25',
            endDate: '2018-06-26',
            subjects: [
                { name: '语文', score: 89, fullScore: 120, classRank: 16, gradeRank: 94 },
                { name: '数学', score: 108, fullScore: 120, classRank: 6, gradeRank: 32 },
                { name: '英语', score: 110, fullScore: 120, classRank: 5, gradeRank: 28 },
                { name: '物理', score: 96, fullScore: 100, classRank: 8, gradeRank: 41 },
                { name: '化学', score: 91, fullScore: 100, classRank: 10, gradeRank: 53 },
                { name: '生物', score: 95, fullScore: 100, classRank: 7, gradeRank: 38 }
            ],
            totalClassRank: 8,
            totalGradeRank: 43,
            classTotal: 48,
            gradeTotal: 620,
            notes: '初三那年第一次知道，原来努力和结果之间，还隔着睡眠、情绪和一点点运气。',
            createdAt: new Date('2018-06-26').toISOString()
        },
        {
            id: 'demo_20210607',
            profileId,
            name: '高考',
            startDate: '2021-06-07',
            endDate: '2021-06-08',
            subjects: [
                { name: '语文', score: 120, fullScore: 150, classRank: 18, gradeRank: 228 },
                { name: '数学', score: 89, fullScore: 150, classRank: 39, gradeRank: 462 },
                { name: '英语', score: 128, fullScore: 150, classRank: 9, gradeRank: 136 },
                { name: '物理', score: 78, fullScore: 110, classRank: 24, gradeRank: 326 },
                { name: '化学', score: 72, fullScore: 100, classRank: 21, gradeRank: 298 },
                { name: '生物', score: 64, fullScore: 90, classRank: 27, gradeRank: 344 }
            ],
            totalClassRank: 29,
            totalGradeRank: 366,
            classTotal: 55,
            gradeTotal: 1200,
            notes: '高考那两天没有想象中惊天动地，更多是安静。走出考场时才意识到，原来青春真的会在某个下午结束。',
            createdAt: new Date('2021-06-08').toISOString()
        },
        {
            id: 'demo_20240628',
            profileId,
            name: '大学期末考试',
            startDate: '2024-06-28',
            endDate: '2024-06-29',
            subjects: [
                { name: '专业课一', score: 86, fullScore: 100, classRank: 12, gradeRank: 48 },
                { name: '专业课二', score: 81, fullScore: 100, classRank: 16, gradeRank: 62 },
                { name: '学术写作', score: 89, fullScore: 100, classRank: 8, gradeRank: 35 },
                { name: '英语', score: 78, fullScore: 100, classRank: 19, gradeRank: 80 }
            ],
            totalClassRank: 11,
            totalGradeRank: 44,
            classTotal: 36,
            gradeTotal: 180,
            notes: '大学第一次不再只想考高分了，开始偷偷问自己：我学这些，是为了成为怎样的人。',
            createdAt: new Date('2024-06-29').toISOString()
        },
        {
            id: 'demo_20251221',
            profileId,
            name: '研究生考试',
            startDate: '2025-12-21',
            endDate: '2025-12-22',
            subjects: [
                { name: '政治', score: 73, fullScore: 100, classRank: 14, gradeRank: 70 },
                { name: '英语', score: 79, fullScore: 100, classRank: 10, gradeRank: 52 },
                { name: '专业课一', score: 121, fullScore: 150, classRank: 8, gradeRank: 40 },
                { name: '专业课二', score: 126, fullScore: 150, classRank: 6, gradeRank: 31 }
            ],
            totalClassRank: 7,
            totalGradeRank: 34,
            classTotal: 28,
            gradeTotal: 420,
            notes: '那时已经不再急着证明自己了，只想把这些年散掉的心，一点点重新收回来。',
            createdAt: new Date('2025-12-22').toISOString()
        },
        {
            id: 'demo_20270930',
            profileId,
            name: '毕业后第一年',
            startDate: '2027-09-30',
            endDate: '2027-09-30',
            subjects: [
                { name: '自我认同', score: 58, fullScore: 100 },
                { name: '爱与被爱', score: 64, fullScore: 100 },
                { name: '身体能量', score: 92, fullScore: 100 },
                { name: '世界感受', score: 72, fullScore: 100 },
                { name: '稳定感', score: 46, fullScore: 100 },
                { name: '幸福感', score: 55, fullScore: 100 }
            ],
            notes: '第一次领工资时很开心，第一次熬到凌晨改方案也是真的累。原来长大不是突然会了，而是硬着头皮继续往前。',
            createdAt: new Date('2027-09-30').toISOString()
        },
        {
            id: 'demo_20351018',
            profileId,
            name: '35岁阶段回顾',
            startDate: '2035-10-18',
            endDate: '2035-10-18',
            subjects: [
                { name: '自我认同', score: 98, fullScore: 100 },
                { name: '爱与被爱', score: 99, fullScore: 100 },
                { name: '身体能量', score: 86, fullScore: 100 },
                { name: '世界感受', score: 98, fullScore: 100 },
                { name: '稳定感', score: 99, fullScore: 100 },
                { name: '幸福感', score: 98, fullScore: 100 }
            ],
            notes: '35岁并没有变成小时候想象的“大人模样”，只是终于学会对自己宽一点，也对身边的人更柔软一点。',
            createdAt: new Date('2035-10-18').toISOString()
        },
        {
            id: 'demo_20601103',
            profileId,
            name: '60岁人生回顾',
            startDate: '2060-11-03',
            endDate: '2060-11-03',
            subjects: [
                { name: '自我认同', score: 94, fullScore: 100 },
                { name: '爱与被爱', score: 96, fullScore: 100 },
                { name: '身体能量', score: 74, fullScore: 100 },
                { name: '世界感受', score: 95, fullScore: 100 },
                { name: '稳定感', score: 96, fullScore: 100 },
                { name: '幸福感', score: 97, fullScore: 100 }
            ],
            notes: '到了这个年纪才明白，所谓圆满不是没有遗憾，而是终于能微笑着和自己的一生坐下来聊一聊。',
            createdAt: new Date('2060-11-03').toISOString()
        }
    ];

    const demoIds = new Set(demoExams.map(exam => exam.id));
    let exams = getExamsAll();
    exams = exams.filter(exam => !demoIds.has(exam.id)).concat(demoExams);
    await saveExams(exams);

    state.currentExamId = demoExams[0].id;
    if (_refreshAll) await _refreshAll();

    if (!silent) {
        showToast({ icon: '🎉', title: '添加成功', message: '已添加 8 组人生阶段示例数据' });
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
