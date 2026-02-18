import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'server', 'data');
const SOURCE_TENANT = 'connectai-main';
const TARGET_TENANT = 'default-tenant';

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = async (filePath, data) => {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const uniqueBy = (items, keyFn) => {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
};

const mergeValue = (target, source) => {
  if (Array.isArray(target) && Array.isArray(source)) {
    const isObjectArray = target.some((v) => v && typeof v === 'object') || source.some((v) => v && typeof v === 'object');
    if (!isObjectArray) return Array.from(new Set([...target, ...source]));
    const items = [...target, ...source];
    return uniqueBy(items, (item) => {
      if (!item || typeof item !== 'object') return JSON.stringify(item);
      return item.id || item.email || item.domain || item.tenantId || JSON.stringify(item);
    });
  }
  if (target && typeof target === 'object' && source && typeof source === 'object') {
    const out = { ...target };
    const keys = new Set([...Object.keys(source), ...Object.keys(target)]);
    for (const key of keys) {
      out[key] = mergeValue(target[key], source[key]);
    }
    return out;
  }
  if (target === undefined || target === null || target === '') return source;
  return target;
};

const mergeSettingsStore = (records) => {
  const list = Array.isArray(records) ? [...records] : [];
  const source = list.find((r) => r?.tenantId === SOURCE_TENANT);
  const target = list.find((r) => r?.tenantId === TARGET_TENANT);
  if (!source) return list;
  const mergedData = mergeValue(target?.data || {}, source?.data || {});
  const next = list.filter((r) => r?.tenantId !== SOURCE_TENANT && r?.tenantId !== TARGET_TENANT);
  next.push({ tenantId: TARGET_TENANT, data: mergedData });
  return next;
};

const migrateTenantArray = (records) => {
  const list = Array.isArray(records) ? records : [];
  const remapped = list.map((item) =>
    item?.tenantId === SOURCE_TENANT ? { ...item, tenantId: TARGET_TENANT } : item
  );
  return uniqueBy(remapped, (item) => item?.id || item?.externalId || JSON.stringify(item));
};

const run = async () => {
  const targets = [
    { file: 'settings.json', migrate: mergeSettingsStore },
    { file: 'calls.json', migrate: migrateTenantArray },
    { file: 'users.json', migrate: migrateTenantArray },
  ];

  for (const target of targets) {
    const filePath = path.join(DATA_DIR, target.file);
    const before = await readJson(filePath, null);
    if (!before) continue;
    const after = target.migrate(before);
    await writeJson(filePath, after);
    console.log(`[tenant-migrate] ${target.file}: migrated ${SOURCE_TENANT} -> ${TARGET_TENANT}`);
  }
};

run().catch((error) => {
  console.error('[tenant-migrate] failed', error?.message || error);
  process.exit(1);
});
