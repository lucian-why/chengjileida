// Playwright 脚本：点击考试列表项，捕获所有 JS 错误和点击事件
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const errors = [];
  const consoleLogs = [];
  
  // 捕获所有 JS 错误
  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}\n${err.stack}`));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleLogs.push(`CONSOLE ERROR: ${msg.text()}`);
  });
  
  // 导航到页面
  await page.goto('http://localhost:8899', { waitUntil: 'networkidle' });
  
  // 等待页面加载完成
  await page.waitForTimeout(2000);
  
  // 截图看当前状态
  await page.screenshot({ path: 'E:\\成绩管家\\成绩管家_web\\test-before-click.png', fullPage: true });
  
  // 查找考试列表项
  const examItems = await page.evaluate(() => {
    const items = document.querySelectorAll('.exam-item, [onclick*="selectExam"], .exam-list-item, .exam-card');
    return Array.from(items).map((el, i) => ({
      index: i,
      tag: el.tagName,
      className: el.className,
      onclick: el.getAttribute('onclick'),
      text: el.textContent?.trim().substring(0, 50)
    }));
  });
  
  console.log('=== 找到的考试列表项 ===');
  console.log(JSON.stringify(examItems, null, 2));
  
  // 也查找所有带 onclick 的元素
  const allOnclick = await page.evaluate(() => {
    const items = document.querySelectorAll('[onclick]');
    return Array.from(items).map(el => ({
      tag: el.tagName,
      className: el.className?.substring(0, 60),
      onclick: el.getAttribute('onclick')?.substring(0, 100),
      text: el.textContent?.trim().substring(0, 30)
    })).filter(x => x.onclick);
  });
  
  console.log('\n=== 所有带 onclick 的元素 ===');
  console.log(JSON.stringify(allOnclick, null, 2));
  
  // 尝试找到并点击第一个考试项
  if (examItems.length > 0) {
    console.log('\n=== 尝试点击第一个考试项 ===');
    
    // 注入 click 监听器来追踪事件
    await page.evaluate(() => {
      window.__clickLog = [];
      document.addEventListener('click', e => {
        window.__clickLog.push({
          target: e.target.tagName + '.' + e.target.className,
          id: e.target.id,
          onclick: e.target.getAttribute('onclick')
        });
      }, true); // capture phase
    });
    
    try {
      // 点击第一个考试项
      const firstItem = await page.locator('.exam-item, [onclick*="selectExam"], .exam-list-item, .exam-card').first();
      await firstItem.click({ timeout: 5000 });
      
      await page.waitForTimeout(1000);
      
      // 获取 click log
      const clickLog = await page.evaluate(() => window.__clickLog);
      console.log('Click event log:', JSON.stringify(clickLog, null, 2));
      
    } catch (e) {
      console.error('点击失败:', e.message);
    }
    
    // 点击后截图
    await page.screenshot({ path: 'E:\\成绩管家\\成绩管家_web\\test-after-click.png', fullPage: true });
  }
  
  // 输出所有捕获的错误
  console.log('\n=== 捕获的 JS 错误 (' + errors.length + '个) ===');
  errors.forEach(e => console.log(e));
  
  console.log('\n=== 控制台错误 (' + consoleLogs.length + '个) ===');
  consoleLogs.forEach(l => console.log(l));
  
  // 检查是否有全局函数未定义
  const globalCheck = await page.evaluate(() => {
    const funcs = ['selectExam', 'showExamDetail', 'getActiveProfileId', 'renderExamDetail', 'getExams'];
    return funcs.map(f => ({ name: f, exists: typeof window[f] !== 'undefined' }));
  });
  console.log('\n=== 全局函数检查 ===');
  console.log(JSON.stringify(globalCheck, null, 2));
  
  await browser.close();
})().catch(e => { console.error('脚本错误:', e); process.exit(1); });
