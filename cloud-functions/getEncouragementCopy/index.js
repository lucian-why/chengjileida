const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

const COLLECTION = 'encouragement_copies';

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

exports.main = async (event = {}) => {
  const payload = parseEventPayload(event);
  const sceneKey = String(payload.sceneKey || '').trim();
  const excludeId = String(payload.excludeId || '').trim();

  if (!sceneKey) {
    return { code: 400, message: 'sceneKey 不能为空' };
  }

  try {
    const result = await db.collection(COLLECTION)
      .where({ sceneKey, status: 'active' })
      .limit(200)
      .get();

    const ordered = sortCopies(result.data || []);
    const candidates = ordered.filter(item => String(item._id) !== excludeId);
    const pool = candidates.length > 0 ? candidates : ordered;

    if (!pool.length) {
      return { code: 404, message: '当前场景暂无可用文案' };
    }

    const selected = pool[Math.floor(Math.random() * pool.length)];

    return {
      code: 0,
      data: {
        id: selected._id,
        sceneKey: selected.sceneKey,
        title: selected.title,
        subtitle: selected.subtitle,
        status: selected.status,
        sortOrder: selected.sortOrder || 0,
        tags: Array.isArray(selected.tags) ? selected.tags : [],
        mood: selected.mood || '',
        ageStageHint: selected.ageStageHint || '',
        version: selected.version || 1,
        updatedAt: selected.updatedAt || selected.createdAt || null
      }
    };
  } catch (error) {
    console.error('[getEncouragementCopy] error:', error);
    return { code: 500, message: '读取暖心文案失败：' + (error.message || '未知错误') };
  }
};
