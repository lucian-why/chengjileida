const fs = require('fs');
const path = 'E:\\成绩管家\\成绩管家_web';

const dist = fs.readFileSync(path + '\\dist\\index.html', 'utf-8');
const legacy = fs.readFileSync(path + '\\index-legacy-v2.html', 'utf-8');

let findings = [];

function log(msg) { findings.push(msg); console.log(msg); }

log('='.repeat(60));
log('  成绩管家 新版(dist) vs Legacy 关键差异分析');
log('  文件大小: 新版=' + (dist.length/1024).toFixed(1) + 'KB, Legacy=' + (legacy.length/1024).toFixed(1) + 'KB');
log('='.repeat(60));

// ========== 1. Script 标签分析 ==========
log('\n========== 1. Script 标签类型 ==========');
const distScripts = [];
const legacyScripts = [];
dist.replace(/<script([^>]*)>/g, (_, attrs) => distScripts.push(attrs.trim()));
legacy.replace(/<script([^>]*)>/g, (_, attrs) => legacyScripts.push(attrs.trim()));
log('新版 (' + distScripts.length + '个):');
distScripts.forEach((s, i) => log('  [' + i + '] ' + s));
log('\nLegacy (' + legacyScripts.length + '个):');
legacyScripts.forEach((s, i) => log('  [' + i + '] ' + s));

// ========== 2. 全局函数导出方式 ==========
log('\n========== 2. 全局函数定义/导出方式 ==========');
['selectExam', 'renderExamDetail', 'openScoreModal', 'editSubjectScore', 'deleteExam'].forEach(fn => {
    const dPatterns = [];
    const lPatterns = [];
    
    // 搜索各种可能的定义模式
    const patterns = [
        new RegExp('function\\s+' + fn + '\\s*\\(', 'g'),
        new RegExp(fn + '\\s*[:=]\\s*function', 'g'),
        new RegExp('window\\.' + fn + '\\s*=', 'g'),
        new RegExp(fn + '\\s*:\\s*function', 'g'),  // 对象方法
    ];
    
    patterns.forEach(p => {
        const dm = dist.match(p);
        if (dm) dPatterns.push(dm[0].trim());
        const lm = legacy.match(p);
        if (lm) lPatterns.push(lm[0].trim());
    });
    
    log(fn + ':');
    log('  新版: ' + (dPatterns.length ? dPatterns.join(', ') : '(未找到定义!)'));
    log('  Legacy: ' + (lPatterns.length ? lPatterns.join(', ') : '(未找到定义!)'));
});

// ========== 3. exam-list 渲染模板（最关键！）==========
log('\n========== 3. exam-list 模板中的 onclick ==========');

// 在两个文件中搜索包含 exam-list 和 onclick 的代码段
const findTemplate = (html, label) => {
    // 方法1: 直接搜索 renderExamList 或类似函数
    const funcMatch = html.match(/renderExamList[\s\S]{0,2000}onclick/gi);
    if (funcMatch) {
        // 提取 onclick 相关部分
        const onclickMatches = funcMatch[0].match(/onclick="[^"]{10,200}"/g);
        return onclickMatches || [];
    }
    
    // 方法2: 搜索 exam-list 附近的内容
    const listMatch = html.match(/exam-list[\s\S]{0,1000}/);
    if (listMatch) {
        const om = listMatch[0].match(/onclick="[^"]{10,200}"/g);
        return om || [];
    }
    
    return [];
};

const distOnclicks = findTemplate(dist, 'dist');
const legacyOnclicks = findTemplate(legacy, 'legacy');

log('新版 onclick 模板 (' + distOnclicks.length + '个):');
distOnclicks.forEach((o, i) => log('  [' + i + '] ' + o.substring(0, 150)));

log('\nLegacy onclick 模板 (' + legacyOnclicks.length + '个):');
legacyOnclicks.forEach((o, i) => log('  [' + i + '] ' + o.substring(0, 150)));

// ========== 4. CSS 中可能影响交互的属性 ==========
log('\n========== 4. 影响点击的 CSS 属性 ==========');
const cssRules = [
    'pointer-events:\\s*none',
    'user-select:\\s*none',
    '-webkit-user-select',
    'touch-action:\\s*none',
    'cursor:\\s*not-allowed',
    'cursor:\\s*default',
];

cssRules.forEach(rule => {
    const dc = (dist.match(new RegExp(rule, 'g')) || []).length;
    const lc = (legacy.match(new RegExp(rule, 'g')) || []).length;
    if (dc > 0 || lc > 0) {
        log(rule + ' → 新版:' + dc + ', Legacy:' + lc + (dc !== lc ? ' ⚠️ 数量不同!' : ''));
    }
});

// ========== 5. overlay / modal / fixed 元素 ==========
log('\n========== 5. 可能遮挡的固定/绝对定位元素 ==========');
const overlaySelectors = [
    /\bclass="[^"]*(?:overlay|modal|popup|dialog|backdrop|fixed)[^"]*"/gi,
    /position:\s*fixed/gi,
    /z-index:\s*[1-9][0-9]{2,}/gi,
];

overlaySelectors.forEach(sel => {
    const dc = (dist.match(sel) || []).length;
    const lc = (legacy.match(sel) || []).length;
    log(sel.source.replace(/[\\\/]/g, '') + ' → 新版:' + dc + ', Legacy:' + lc + (dc !== lc ? ' ⚠️' : ''));
});

// ========== 6. initApp / DOMContentLoaded 时序 ==========
log('\n========== 6. 初始化时序 ==========');
['DOMContentLoaded', 'initApp', 'refreshAll', 'renderExamList'].forEach(keyword => {
    const dc = (dist.match(new RegExp(keyword, 'g')) || []).length;
    const lc = (legacy.match(new RegExp(keyword, 'g')) || []).length;
    log(keyword + ' → 新版:' + dc + ', Legacy:' + lc);
});

// ========== 7. 最关键: 检查新版 module script 中 window.xxx 赋值位置 ==========
log('\n========== 7. 新版中 window 函数赋值位置 ==========');
if (dist.includes('<script type="module">') || dist.includes('"module"')) {
    log('✅ 新版使用了 <script type="module">');
    
    // 找到所有 window.xxx = 的位置（相对于模块脚本）
    const windowAssignments = [];
    let idx = 0;
    while (true) {
        idx = dist.indexOf('window.', idx);
        if (idx === -1) break;
        const snippet = dist.substring(idx, Math.min(idx + 80, dist.length));
        if (snippet.includes('=')) {
            windowAssignments.push({
                pos: idx,
                text: snippet.replace(/\n/g, '').substring(0, 70)
            });
        }
        idx++;
    }
    
    log('window.xxx 赋值语句数: ' + windowAssignments.length);
    windowAssignments.slice(0, 15).forEach((a, i) => {
        log('  @' + a.pos + ': ' + a.text);
    });
}

// ========== 8. 总结 ==========
log('\n' + '='.repeat(60));
log('  分析完成！以上是静态代码层面的差异');
log('  如果 onclick 模板一致且函数存在，问题可能在运行时时序');
log('='.repeat(60));

// 写入文件
fs.writeFileSync(path + '\\debug-analysis.txt', findings.join('\n'));
log('\n结果已保存到 debug-analysis.txt');
