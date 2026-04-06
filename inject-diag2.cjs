const fs = require('fs');
const f = 'E:\\成绩管家\\成绩管家_web\\dist\\index.html';
let h = fs.readFileSync(f, 'utf8');

// 替换旧诊断脚本为增强版
const oldStart = h.indexOf('// ===== 诊断脚本');
const oldEnd = h.indexOf('},2500)});') + '},2500)});'.length;

if (oldStart === -1) { console.log('ERROR: old script not found'); process.exit(1); }

const newDiag = `<script>
// ===== 诊断脚本 v2（调试完成后会删除）=====
window.__DIAG={errors:[],clicks:[],ready:false};
window.onerror=function(m){window.__DIAG.errors.push(String(m));};
document.addEventListener('click',function(e){window.__DIAG.clicks.push({tag:e.target.tagName,cls:(e.target.className||'').toString().substring(0,80),onclick:e.target.getAttribute('onclick'),id:e.target.id});},true);
window.addEventListener('load',function(){setTimeout(function(){
// 1. 函数检查
var funcs=['selectExam','editExam','deleteExam','toggleExamExclude','selectSubject'];
funcs.forEach(function(n){window.__DIAG[n]=typeof window[n];});

// 2. 点击前状态
var el=document.getElementById('examList');
window.__DIAG.examItemCount=el?el.querySelectorAll('.exam-folder-header').length:-1;
window.__DIAG.firstOnclick=el&&el.querySelector('.exam-folder-header')?el.querySelector('.exam-folder-header').getAttribute('onclick'):null;
var ec=document.getElementById('examContent');
window.__DIAG.beforeClick={examContentHTML:ec?ec.innerHTML.substring(0,150):'NOT FOUND',activeHeader:document.querySelector('.exam-folder-header.active')?.textContent?.trim()};

// 3. 手动调用 selectExam
if(window.selectExam&&window.__DIAG.firstOnclick){var m=window.__DIAG.firstOnclick.match(/selectExam\\(([^)]+)\\)/);if(m){try{window.selectExam(m[1]);window.__DIAG.selectResult='OK';}catch(e){window.__DIAG.selectResult='ERR:'+e.message;window.__DIAG.selectStack=e.stack;}}}

// 4. 调用后状态（等异步渲染完成）
setTimeout(function(){
var ec2=document.getElementById('examContent');
window.__DIAG.afterClick={examContentHTML:ec2?ec2.innerHTML.substring(0,300):'NOT FOUND',activeHeader:document.querySelector('.exam-folder-header.active')?.textContent?.trim(),expandedCount:document.querySelectorAll('.exam-folder.expanded').length};

window.__DIAG.changed=window.__DIAG.beforeClick.examContentHTML!==window.__DIAG.afterClick.examContentHTML;

window.__DIAG.ready=true;
var d=document.createElement('div');d.id='__diag_box';
d.style.cssText='position:fixed;top:0;left:0;z-index:99999;background:#fffde7;padding:15px;font:12px/1.6 monospace;max-width:95vw;max-height:90vh;overflow:auto;border:3px solid #f44336;box-shadow:0 4px 20px rgba(0,0,0,.3)';
d.textContent=JSON.stringify(window.__DIAG,null,2);
document.body.appendChild(d);
console.log('[DIAG]',JSON.stringify(window.__DIAG));
},500);
},2500)});
</script>`;

h = h.substring(0, oldStart) + newDiag + h.substring(oldEnd);
fs.writeFileSync(f, h, 'utf8');
console.log('OK! Injected diag v2. File length:', h.length);
