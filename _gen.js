const fs = require('fs');
const path = require('path');
const SRC = 'E:\\成绩管家\\成绩管家_web\\src';
const SRC_FILE = 'E:\\成绩管家\\成绩管家_web\\index-legacy-v2.html';

const lines = fs.readFileSync(SRC_FILE, 'utf8').split('\n');

function L(start, end) {
  return lines.slice(start - 1, end).map(l => l.replace(/^        /, '')).join('\n');
}

function W(name, content) {
  fs.writeFileSync(path.join(SRC, name), content, 'utf8');
  console.log('OK ' + name + ' (' + content.split('\n').length + ' lines)');
}

// ---- exam-list.js: renderExamList + selectExam + selectSubject ----
W('exam-list.js',
`import state from './store.js';
import { getExams, getActiveProfileId } from './storage.js';

let _updateRadarChartFn = null;
let _renderExamDetailFn = null;
export function setExamListDeps({ updateRadarChart, renderExamDetail }) {
  _updateRadarChartFn = updateRadarChart;
  _renderExamDetailFn = renderExamDetail;
}

${L(2169, 2215).replace(/currentExamId/g, 'state.currentExamId').replace(/^async function renderExamList/, 'export async function renderExamList')}
${L(2218, 2239).replace(/currentExamId/g, 'state.currentExamId').replace(/^async function selectExam/, 'export async function selectExam').replace(/^async function selectSubject/, '\nexport async function selectSubject')}
`);

console.log('Done with exam-list.js');
