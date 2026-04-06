// 用 Playwright 的 programmatic API 做完整测试
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const allErrors = [];
const allConsole = [];

page.on('pageerror', e => allErrors.push({ type: 'pageerror', msg: e.message, stack: e.stack }));
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    allConsole.push({ type: msg.type(), text: msg.text() });
  }
  // 捕获 [DIAG] 日志
  if (msg.text().includes('[DIAG]')) {
    console.log('\n📊 ' + msg.text());
  }
});

console.log('正在打开 http://localhost:8899 ...');
await page.goto('http://localhost:8899', { waitUntil: 'networkidle' });

// 等待模块加载和 initApp 完成
await page.waitForTimeout(3000);

// ===== 1. 检查全局函数 =====
console.log('\n=== 1. 全局函数检查 ===');
const funcCheck = await page.evaluate(() => {
  const funcs = ['selectExam','editExam','deleteExam','toggleExamExclude','selectSubject',
                 'editSubjectScore','openScoreModal','openBatchModal','openShareExamReport'];
  const result = {};
  funcs.forEach(f => result[f] = typeof window[f]);
  return result;
});
console.log(JSON.stringify(funcCheck, null, 2));

// ===== 2. 检查考试列表 =====
console.log('\n=== 2. 考试列表状态 ===');
const listState = await page.evaluate(() => {
  const el = document.getElementById('examList');
  const headers = el ? el.querySelectorAll('.exam-folder-header') : [];
  return {
    found: !!el,
    itemCount: headers.length,
    innerHTML_preview: el ? el.innerHTML.substring(0, 300) : 'NOT FOUND',
    firstOnclick: headers.length > 0 ? headers[0].getAttribute('onclick') : null
  };
});
console.log(JSON.stringify(listState, null, 2));

// ===== 3. 尝试手动调用 selectExam 并捕获错误 =====
console.log('\n=== 3. 手动调用 selectExam ===');
if (listState.firstOnclick) {
  const idMatch = listState.firstOnclick.match(/selectExam\(([^)]+)\)/);
  if (idMatch) {
    const examId = idMatch[1];
    console.log(`尝试调用 selectExam(${examId})...`);
    
    // 先清空错误
    allErrors.length = 0;
    
    try {
      const callResult = await page.evaluate((id) => {
        try {
          window.selectExam(id);
          return { success: true, error: null };
        } catch(e) {
          return { success: false, error: e.message, stack: e.stack };
        }
      }, examId);
      
      console.log('调用结果:', JSON.stringify(callResult));
      
      await page.waitForTimeout(1000);
      
    } catch(e) {
      console.error('evaluate 本身报错:', e.message);
    }
  }
}

// ===== 4. 尝试 DOM 点击 =====
console.log('\n=== 4. DOM 点击测试 ===');
allErrors.length = 0;

try {
  const firstHeader = page.locator('.exam-folder-header').first();
  const count = await firstHeader.count();
  
  if (count > 0) {
    console.log('找到 .exam-folder-header，点击中...');
    
    // 监听 click 事件
    await page.evaluate(() => {
      window.__testClicks = [];
      document.addEventListener('click', e => {
        window.__testClicks.push({
          tag: e.target.tagName,
          cls: e.target.className?.toString()?.substring(0, 50),
          onclick: e.target.getAttribute('onclick')
        });
      }, true);
    });
    
    await firstHeader.click({ timeout: 5000 });
    await page.waitForTimeout(1000);
    
    const clicks = await page.evaluate(() => window.__testClicks || []);
    console.log('触发的事件数:', clicks.length);
    clicks.forEach(c => console.log(' ->', JSON.stringify(c)));
    
    // 截图
    await page.screenshot({ path: 'E:\\\\成绩管家\\\\成绩管家_web\\\\diag-after-click.png', fullPage: true });
    console.log('截图已保存: diag-after-click.png');
  } else {
    console.log('没有找到 .exam-folder-header 元素！');
  }
} catch(e) {
  console.error('DOM 点击失败:', e.message);
}

// ===== 5. 输出所有错误 =====
console.log('\n=== 5. 所有捕获的错误 (' + allErrors.length + '个) ===');
allErrors.forEach((e, i) => {
  console.log(`\n--- 错误 ${i+1} ---`);
  console.log('类型:', e.type);
  console.log('消息:', e.msg);
  if (e.stack) console.log('堆栈:', e.stack.substring(0, 500));
});

if (allErrors.length === 0) {
  console.log('(无错误)');
}

console.log('\n=== 控制台警告/错误 (' + allConsole.length + '个) ===');
allConsole.forEach(c => console.log(`[${c.type}] ${c.text}`));

// ===== 6. 最终状态检查 =====
console.log('\n=== 6. 当前页面状态 ===');
const finalState = await page.evaluate(() => {
  return {
    currentExamId: window.a?.currentExamId || '(无法读取)',
    examContentHTML: document.getElementById('examContent')?.innerHTML?.substring(0, 200) || 'NOT FOUND'
  };
});
console.log(JSON.stringify(finalState, null, 2));

await browser.close();
console.log('\n✅ 测试完成');
