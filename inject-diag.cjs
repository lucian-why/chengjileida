const fs = require('fs');
const f = 'E:\\成绩管家\\成绩管家_web\\dist\\index.html';
let h = fs.readFileSync(f, 'utf8');

const target = '<script type="module" crossorigin>';
const idx = h.indexOf(target);
console.log('File length:', h.length);
console.log('Target found at pos:', idx);

if (idx === -1) {
  console.log('ERROR: target not found!');
  // show what's around where it should be
  const idx2 = h.indexOf('type="module"');
  console.log('type="module" found at:', idx2);
  if (idx2 > -1) {
    console.log('Context:', JSON.stringify(h.substring(Math.max(0, idx2 - 30), idx2 + 50)));
  }
} else {
  const inject = `<script>
// ===== 诊断脚本（调试完成后会删除）=====
window.__DIAG={errors:[],clicks:[],ready:false};
window.onerror=function(m){window.__DIAG.errors.push(String(m));};
document.addEventListener('click',function(e){window.__DIAG.clicks.push({tag:e.target.tagName,cls:(e.target.className||'').toString().substring(0,60),onclick:e.target.getAttribute('onclick'),x:e.clientX,y:e.clientY});},true);
window.addEventListener('load',function(){setTimeout(function(){
var funcs=['selectExam','editExam','deleteExam','toggleExamExclude','selectSubject'];
funcs.forEach(function(n){window.__DIAG[n]=typeof window[n];});
var el=document.getElementById('examList');
window.__DIAG.examItemCount=el?el.querySelectorAll('.exam-folder-header').length:-1;
window.__DIAG.firstOnclick=el&&el.querySelector('.exam-folder-header')?el.querySelector('.exam-folder-header').getAttribute('onclick'):null;
if(window.selectExam&&window.__DIAG.firstOnclick){var m=window.__DIAG.firstOnclick.match(/selectExam\\(([^)]+)\\)/);if(m){try{window.selectExam(m[1]);window.__DIAG.selectResult='OK';}catch(e){window.__DIAG.selectResult='ERR:'+e.message;window.__DIAG.selectStack=e.stack;}}}
window.__DIAG.ready=true;
var d=document.createElement('div');
d.id='__diag_box';
d.style.cssText='position:fixed;top:0;left:0;z-index:99999;background:#fffde7;padding:15px;font:12px/1.6 monospace;max-width:95vw;max-height:90vh;overflow:auto;border:3px solid #f44336;box-shadow:0 4px 20px rgba(0,0,0,.3)';
d.textContent=JSON.stringify(window.__DIAG,null,2);
document.body.appendChild(d);
},2500)});
</script>
`;

  h = h.substring(0, idx) + inject + '\n' + h.substring(idx);
  fs.writeFileSync(f, h, 'utf8');
  console.log('OK! Injected diagnostic script. File length now:', h.length);
}
