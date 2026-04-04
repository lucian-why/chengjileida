import state from './store.js';
import { getExams, getActiveProfileId, saveExams } from './storage.js';
import { showConfirmDialog, showToast } from './modal.js';

// 注入外部依赖
let _refreshAll = null;

export function setDependencies({ refreshAll }) {
    _refreshAll = refreshAll;
}

export function setupImportExport() {
    // ===== 数据导出 =====
    document.getElementById('exportBtn').addEventListener('click', function() {
        const exams = getExams(getActiveProfileId());

        // 创建Excel数据
        const worksheetData = [
            ['考试名称', '日期', '科目', '成绩', '满分', '班级排名', '年级排名', '备注']
        ];

        
        exams.forEach(exam => {
            const date = exam.startDate || '';
            (exam.subjects || []).forEach(subject => {
                worksheetData.push([
                    exam.name,
                    date,
                    subject.name,
                    subject.score,
                    subject.fullScore || 100,
                    subject.classRank || '',
                    subject.gradeRank || '',
                    subject.notes || ''
                ]);
            });
            // 总分排名信息（放在第一个科目行追加备注，或者单独一行）
            // 这里用单独一行来表示总分排名
            if (exam.totalClassRank || exam.totalGradeRank) {
                const peopleInfo = [];
                if (exam.classTotal) peopleInfo.push('班级' + exam.classTotal + '人');
                if (exam.gradeTotal) peopleInfo.push('年级' + exam.gradeTotal + '人');
                worksheetData.push([
                    exam.name,
                    date,
                    '【总分】',
                    (exam.subjects || []).reduce((sum, s) => sum + s.score, 0),
                    '',
                    exam.totalClassRank || '',
                    exam.totalGradeRank || '',
                    peopleInfo.join('，') || ''
                ]);
            }
        });
        
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '成绩记录');

        // 下载Excel文件
        XLSX.writeFile(wb, '成绩管家_' + new Date().toISOString().split('T')[0] + '.xlsx');
    });

    // ===== 数据导入 =====
    document.getElementById('importBtn').addEventListener('click', function() {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // 读取第一个表格（成绩记录）
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                
                if (jsonData.length <= 1) {
                    showToast({ icon: '📄', iconType: 'info', title: '提示', message: 'Excel文件没有数据' });
                    return;
                }
                
                // 解析Excel数据
                const examsMap = {};
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row[0]) continue;
                    
                    const examName = row[0];
                    const date = row[1] || '';
                    const subjectName = row[2];
                    const score = parseFloat(row[3]) || 0;
                    const fullScore = parseFloat(row[4]) || 100;
                    const classRank = parseFloat(row[5]) || null;
                    const gradeRank = parseFloat(row[6]) || null;
                    const notes = row[7] || '';
                    
                    if (!examsMap[examName]) {
                        examsMap[examName] = {
                            id: Date.now() + i,
                            name: examName,
                            startDate: date,
                            subjects: []
                        };
                    }
                    
                    // 处理总分排名行（科目名以【总分】标记）
                    if (subjectName && subjectName.startsWith('【总分】')) {
                        if (classRank) examsMap[examName].totalClassRank = classRank;
                        if (gradeRank) examsMap[examName].totalGradeRank = gradeRank;
                        // 从备注中提取班级人数（格式："班级45人"）
                        if (notes) {
                            const match = notes.match(/班级(\d+)人/);
                            if (match) examsMap[examName].classTotal = parseInt(match[1]);
                            const gradeMatch = notes.match(/年级(\d+)人/);
                            if (gradeMatch) examsMap[examName].gradeTotal = parseInt(gradeMatch[1]);
                        }
                    } else {
                        examsMap[examName].subjects.push({
                            name: subjectName,
                            score: score,
                            fullScore: fullScore,
                            classRank: classRank,
                            gradeRank: gradeRank,
                            notes: notes
                        });
                    }
                }
                
                const importedExams = Object.values(examsMap);
                
                if (importedExams.length > 0) {
                    // 合并数据：同名同日期的覆盖，其他新增
                    const existingExams = getExams(getActiveProfileId());
                    const mergedExams = [...existingExams];
                    
                    importedExams.forEach(importedExam => {
                        importedExam.profileId = getActiveProfileId();
                        const existingIndex = mergedExams.findIndex(e => 
                            e.name === importedExam.name && e.startDate === importedExam.startDate
                        );
                        if (existingIndex >= 0) {
                            // 覆盖原有数据，保留ID
                            mergedExams[existingIndex] = { ...importedExam, id: mergedExams[existingIndex].id };
                        } else {
                            // 新增
                            mergedExams.push(importedExam);
                        }
                    });
                    
                    // 按开始日期排序，最新的在前
                    mergedExams.sort((a, b) => {
                        const dateA = a.startDate || '1970-01-01';
                        const dateB = b.startDate || '1970-01-01';
                        return new Date(dateB) - new Date(dateA);
                    });
                    
                    // 计算覆盖数量
                    const coverCount = mergedExams.length - existingExams.length < 0 ? 0 : importedExams.length - (mergedExams.length - existingExams.length);
                    
                    if (coverCount === 0) {
                        // 没有覆盖数据，直接导入
                        saveExams(mergedExams);
                        if (_refreshAll) _refreshAll();
                        showToast({ icon: '📥', title: '导入成功', message: `已导入 ${importedExams.length} 条考试记录` });
                    } else {
                        // 有覆盖数据，弹窗确认
                        showConfirmDialog({
                            icon: '🔄',
                            iconType: 'info',
                            title: '数据重复',
                            message: `发现 ${coverCount} 个考试记录与已有数据重名，将用导入数据覆盖原有记录。`,
                            okText: '覆盖导入',
                            okClass: 'confirm-ok-btn blue',
                            onConfirm: function() {
                                saveExams(mergedExams);
                                if (_refreshAll) _refreshAll();
                                showToast({ icon: '📥', title: '导入成功', message: `已导入 ${importedExams.length} 条考试记录（覆盖 ${coverCount} 条）` });
                            }
                        });
                    }
                } else {
                    showToast({ icon: '⚠️', iconType: 'danger', title: '导入失败', message: '无法解析Excel文件，请检查格式' });
                }
            } catch (err) {
                showToast({ icon: '❌', iconType: 'danger', title: '导入失败', message: '文件解析失败: ' + err.message });
            }
        };
        reader.readAsArrayBuffer(file);
        this.value = '';
    });
}
