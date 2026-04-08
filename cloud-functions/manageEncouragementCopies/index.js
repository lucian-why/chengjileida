const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

const COLLECTION = 'encouragement_copies';
const ADMIN_ACCESS_TOKEN = 'xueji_admin_token_v1';

const DEFAULT_COPIES = {
  'exam_detail.collapsed_empty': [
    { title: '先歇一会儿也没关系。', subtitle: '你愿意回来继续看时，这里还会安安静静等你。', sortOrder: 10 },
    { title: '不是每一次打开，都一定要立刻面对分数。', subtitle: '给自己一点缓冲，也是在认真照顾自己。', sortOrder: 20 },
    { title: '这页空下来以后，心也可以慢一点。', subtitle: '成绩会留下痕迹，但你不只是一串数字。', sortOrder: 30 },
    { title: '今天先看到这里，也是一种节奏。', subtitle: '慢慢来，比勉强自己更重要。', sortOrder: 40 },
    { title: '愿你看成绩的时候，也别忘了看见自己。', subtitle: '努力、疲惫、失常和回升，都是成长的一部分。', sortOrder: 50 },
    { title: '把这一场先轻轻放下吧。', subtitle: '等你准备好了，再回来和它坐一会儿。', sortOrder: 60 }
  ]
};

function parseEventPayload(event) {
  if (!event) return {};
  if (typeof event === 'string') {
    try { return JSON.parse(event); } catch { return {}; }
  }
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
    return event.queryStringParameters;
  }
  if (event.queryString && typeof event.queryString === 'object') {
    return event.queryString;
  }
  if (event.body) {
    let body = event.body;
    if (event.isBase64Encoded && typeof body === 'string') {
      try { body = Buffer.from(body, 'base64').toString('utf8'); } catch {}
    }
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch {}
      try { return Object.fromEntries(new URLSearchParams(body)); } catch {}
      return {};
    }
    if (typeof body === 'object') return body;
  }
  return event;
}

function sortCopies(list = []) {
  return [...list].sort((a, b) => {
    const sortGap = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    if (sortGap !== 0) return sortGap;
    return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
  });
}

function normalizeCopyInput(raw = {}) {
  const title = String(raw.title || '').trim();
  const subtitle = String(raw.subtitle || '').trim();
  const sceneKey = String(raw.sceneKey || '').trim();
  const status = String(raw.status || 'active').trim() === 'inactive' ? 'inactive' : 'active';
  const sortOrder = Number(raw.sortOrder || 0);

  if (!sceneKey) throw new Error('sceneKey 不能为空');
  if (!title) throw new Error('主句不能为空');
  if (!subtitle) throw new Error('副句不能为空');

  return {
    sceneKey,
    title,
    subtitle,
    status,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    tags: Array.isArray(raw.tags) ? raw.tags.map(tag => String(tag).trim()).filter(Boolean) : [],
    mood: String(raw.mood || '').trim(),
    ageStageHint: String(raw.ageStageHint || '').trim(),
    version: Number(raw.version || 1) || 1
  };
}

async function listCopies(sceneKey = '') {
  const query = sceneKey ? { sceneKey } : {};
  const result = await db.collection(COLLECTION).where(query).limit(200).get();
  return sortCopies(result.data || []).map(item => ({
    id: item._id,
    sceneKey: item.sceneKey,
    title: item.title,
    subtitle: item.subtitle,
    status: item.status || 'active',
    sortOrder: item.sortOrder || 0,
    tags: Array.isArray(item.tags) ? item.tags : [],
    mood: item.mood || '',
    ageStageHint: item.ageStageHint || '',
    version: item.version || 1,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  }));
}

async function saveCopy(copy) {
  const normalized = normalizeCopyInput(copy);
  const now = new Date();

  if (copy.id) {
    await db.collection(COLLECTION).doc(copy.id).update({
      ...normalized,
      updatedAt: now
    });
    return { id: copy.id, ...normalized, updatedAt: now };
  }

  const result = await db.collection(COLLECTION).add({
    ...normalized,
    createdAt: now,
    updatedAt: now
  });

  return { id: result.id || result._id || '', ...normalized, createdAt: now, updatedAt: now };
}

async function removeCopy(id) {
  if (!id) throw new Error('id 不能为空');
  await db.collection(COLLECTION).doc(id).remove();
  return { id };
}

async function toggleStatus(id, status) {
  if (!id) throw new Error('id 不能为空');
  const nextStatus = String(status || 'inactive') === 'inactive' ? 'inactive' : 'active';
  const now = new Date();
  await db.collection(COLLECTION).doc(id).update({
    status: nextStatus,
    updatedAt: now
  });
  return { id, status: nextStatus, updatedAt: now };
}

async function seedDefaults(sceneKey) {
  const targets = sceneKey ? { [sceneKey]: DEFAULT_COPIES[sceneKey] || [] } : DEFAULT_COPIES;
  let insertedCount = 0;

  for (const [targetSceneKey, copies] of Object.entries(targets)) {
    if (!copies.length) continue;

    const existing = await db.collection(COLLECTION).where({ sceneKey: targetSceneKey }).limit(200).get();
    const signatures = new Set((existing.data || []).map(item => `${item.title}@@${item.subtitle}`));

    for (const item of copies) {
      const signature = `${item.title}@@${item.subtitle}`;
      if (signatures.has(signature)) continue;

      await db.collection(COLLECTION).add({
        sceneKey: targetSceneKey,
        title: item.title,
        subtitle: item.subtitle,
        status: 'active',
        sortOrder: Number(item.sortOrder || 0),
        tags: [],
        mood: '',
        ageStageHint: '',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      insertedCount += 1;
    }
  }

  return { insertedCount };
}

function assertAdmin(event = {}) {
  if (String(event.adminAccessToken || '').trim() !== ADMIN_ACCESS_TOKEN) {
    const error = new Error('只有管理员可以访问这个接口');
    error.code = 403;
    throw error;
  }
}

exports.main = async (event = {}) => {
  const payload = parseEventPayload(event);
  if (typeof payload.copy === 'string') {
    try { payload.copy = JSON.parse(payload.copy); } catch {}
  }
  const action = String(payload.action || '').trim();

  try {
    assertAdmin(payload);
    switch (action) {
      case 'list':
        return { code: 0, data: { copies: await listCopies(String(payload.sceneKey || '').trim()) } };
      case 'save':
        return { code: 0, data: await saveCopy(payload.copy || {}) };
      case 'remove':
        return { code: 0, data: await removeCopy(String(payload.id || '').trim()) };
      case 'toggleStatus':
        return { code: 0, data: await toggleStatus(String(payload.id || '').trim(), payload.status) };
      case 'seedDefaults':
        return { code: 0, data: await seedDefaults(String(payload.sceneKey || '').trim()) };
      default:
        return { code: 400, message: '不支持的 action' };
    }
  } catch (error) {
    console.error('[manageEncouragementCopies] error:', error);
    return { code: error.code || 500, message: error.message || '文案库操作失败' };
  }
};
