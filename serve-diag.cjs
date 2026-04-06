// 纯 Node.js HTTP 诊断：注入诊断脚本到 HTML，启动服务，用 fetch 检查
const http = require('http');
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, 'dist', 'index.html');
let html = fs.readFileSync(distPath, 'utf8');

// 注入诊断脚本
const diagScript = `
<script>
window.__diagResult = { errors: [], funcs: {}, clicks: [], ready: false };

window.onerror = function(msg) {
  window.__diagResult.errors.push(String(msg));
};

document.addEventListener('click', function(e) {
  window.__diagClicks = window.__diagClicks || [];
  window.__diagClicks.push({
    tag: e.target.tagName,
    cls: e.target.className?.toString()?.substring(0,60),
    onclick: e.target.getAttribute('onclick'),
    x: e.clientX, y: e.clientY,
    time: Date.now()
  });
}, true);

window.addEventListener('load', function() {
  setTimeout(function() {
    var f = ['selectExam','editExam','deleteExam','toggleExamExclude','selectSubject'];
    f.forEach(function(name) { window.__diagResult.funcs[name] = typeof window[name]; });
    
    var el = document.getElementById('examList');
    window.__diagResult.examItemCount = el ? el.querySelectorAll('.exam-folder-header').length : -1;
    window.__diagResult.firstOnclick = null;
    
    if (el) {
      var h = el.querySelector('.exam-folder-header');
      if (h) window.__diagResult.firstOnclick = h.getAttribute('onclick');
    }
    
    // 尝试调用 selectExam
    if (window.selectExam && window.__diagResult.firstOnclick) {
      var m = window.__diagResult.firstOnclick.match(/selectExam\\(([^)]+)\\)/);
      if (m) {
        try { 
          window.selectExam(m[1]); 
          window.__diagResult.selectExamCall = 'OK'; 
        } catch(e) { 
          window.__diagResult.selectExamCall = 'ERROR:' + e.message; 
          window.__diagResult.selectExamStack = e.stack;
        }
      }
    }
    
    window.__diagResult.ready = true;
    
    // 将结果写入 DOM 以便查看
    var div = document.createElement('div');
    div.id = '__diag_output';
    div.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:#fff;padding:10px;font-size:12px;max-width:90vw;max-height:80vh;overflow:auto;border:2px solid red';
    div.textContent = JSON.stringify(window.__diagResult, null, 2);
    document.body.appendChild(div);
  }, 2000);
});
</script>
`;

html = html.replace('</head>', diagScript + '\n</head>');

const server = http.createServer((req, res) => {
  console.log('[REQ]', req.url);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(8898, () => {
  console.log('========================================');
  console.log('诊断服务器已启动！');
  console.log('请在 Chrome 浏览器打开: http://localhost:8898');
  console.log('');
  console.log('页面会自动:');
  console.log('  1. 检查全局函数是否存在');
  console.log('  2. 尝试自动点击第一个考试项');
  console.log('  3. 在页面左上角显示红色诊断面板');
  console.log('');
  console.log('请把看到的诊断面板内容截图或复制给我');
  console.log('========================================');
});
