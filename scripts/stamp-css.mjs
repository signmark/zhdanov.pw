// task #23: метка версии у CSS.
//
// Зачем: nginx отдаёт /assets/site.css с `expires 30d`. Ссылка на файл без
// метки версии значит, что после правки стилей браузер месяц показывает
// старый CSS, и «я же обновил» превращается в спор на неделю. Метка `?v=`
// меняется вместе с содержимым CSS, поэтому новый адрес — новый файл в кэше.
//
// Метка — первые 8 символов sha256 от содержимого assets/site.css. Не
// придумываем номер версии вручную: он разъезжается с файлом, и единственный
// способ узнать, что метка устарела, — это посмотреть на хэш.
//
// Запуск: node scripts/stamp-css.mjs  (входит в `npm run build`)
// Идемпотентно: старая метка снимается, новая ставится, повторный запуск на
// неизменённом CSS ничего не меняет.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = join(ROOT, 'assets/site.css');

const hash = createHash('sha256').update(readFileSync(CSS)).digest('hex').slice(0, 8);

// Страницы: корневая, русская и 404. Ищем все .html, а не перечисляем:
// забытая страница получила бы ссылку без метки и осталась бы со старым CSS.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith('.html') ? [full] : [];
  });

const LINK_RE = /(href="\/assets\/site\.css)(\?v=[0-9a-f]+)?(")/g;
let changed = 0;
for (const f of walk(ROOT)) {
  const rel = f.slice(ROOT.length + 1);
  if (rel.startsWith('node_modules/')) continue;
  const before = readFileSync(f, 'utf8');
  if (!before.includes('/assets/site.css')) continue;
  const after = before.replace(LINK_RE, `$1?v=${hash}$3`);
  if (after === before) continue;
  writeFileSync(f, after, 'utf8');
  changed += 1;
  console.log(`  ${rel}: метка CSS → ?v=${hash}`);
}

const size = statSync(CSS).size;
console.log(
  changed
    ? `OK: метка ${hash} проставлена в ${changed} файл(ах), CSS ${size} байт`
    : `OK: метка ${hash} уже стоит везде, CSS ${size} байт — ничего не менялось`,
);
