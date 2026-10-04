#!/usr/bin/env python3
"""zhdanov.pw, task #17: порчи сторожа scripts/check-seo.mjs.

Каждая порча ломает ровно одно условие, которому сторож обязан краснеть:
  1. у русской страницы нет canonical
  2. у английской страницы нет hreflang="x-default"
  3. у русской страницы нет og:image
  4. в /ru/ осталась английская строка (русский текст не в разметке)
  5. nginx откатывает несуществующий адрес на главную — «мягкая 404»

Порча проверяется на настоящем поведении (реальный файл + реальный запуск
node и живого nginx), откатывается байт в байт, после отката сторож обязан
снова быть зелёным. Перед правкой проверяем счётчик совпадений: если ломать
нечего, порча сломалась сама о себе (такое уже было, см. MEMORY.md).
"""
import subprocess, sys, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECK = ROOT / "scripts" / "check-seo.mjs"
NOINDEX = '<meta name="robots" content="noindex, follow">'

# Абзац, который возвращаем в /ru/ английским. Оба текста берём из файлов, а не
# пишем руками: иначе порча незаметно перестанет соответствовать словарю.
KEY = "about.c1d"
TAG = re.compile(r'<([a-zA-Z][\w-]*)((?:\s[^>]*?)?)\sdata-i18n(?:-html)?="([^"]+)"((?:\s[^>]*?)?)>([\s\S]*?)</\1>')
_src = (ROOT / "index.html").read_text(encoding="utf-8")
_dict = json.loads((ROOT / "i18n" / "ru.json").read_text(encoding="utf-8"))
EN_TEXT = next(m.group(5).strip() for m in TAG.finditer(_src) if m.group(3) == KEY)
RU_TEXT = _dict["strings"][KEY].strip()
# Английский абзац в разметке разбит переносами и отступами, а сторож
# сравнивает по схлопнутым пробелам. Подставляем текст в том же виде, в каком
# его увидит сравнение, иначе порча «есть», а красного сообщения нет.
EN_TEXT = " ".join(EN_TEXT.split())
if len(EN_TEXT) < 40 or len(RU_TEXT) < 40:
    sys.exit(f"ЗАМЕР НЕ ВЫПОЛНИЛСЯ: слишком короткий абзац для ключа {KEY}")


def run():
    p = subprocess.run(["node", str(CHECK)], capture_output=True, text=True, cwd=ROOT)
    return p.returncode, (p.stdout + p.stderr)


def apply(rel, old, new, expected):
    """Правит файл и проверяет результат. При любой ошибке возвращает файл
    как было: иначе упавшая проверка оставит после себя сломанную страницу,
    и следующий запуск будет красным не из-за порчи, а из-за нашего же мусора."""
    p = ROOT / rel
    before = p.read_bytes()
    text = before.decode("utf-8")
    n = text.count(old)
    assert n == expected, f"{rel}: «{old[:50]}…» встречается {n} раз, ждали {expected}"
    p.write_bytes(text.replace(old, new, expected).encode("utf-8"))
    try:
        assert p.read_bytes() != before, f"{rel}: файл не изменился — порча не состоялась"
        # После правки портимого текста быть не должно. Раньше здесь стояла
        # проверка счётчика новой строки, но она ломалась, когда порча вставляет
        # строку, уже бывшую в файле (например «Dmitry Zhdanov» в JSON-LD).
        left = p.read_text(encoding="utf-8").count(old)
        assert left == 0, f"{rel}: «{old[:50]}…» осталась {left} раз после правки"
    except BaseException:
        p.write_bytes(before)
        raise
    return before


def mutation(name, rel, old, new, expected, must_see):
    print(f"\n=== {name} ===")
    snap = apply(rel, old, new, expected)
    code, out = run()
    line = next((l for l in out.splitlines() if must_see in l), None)
    print(f"  правка: {rel}")
    print(f"  код возврата: {code} ({'ожидаемо' if code != 0 else 'НЕОЖИДАННО — сторож зелёный!'})")
    print(f"  строка сторожа: {line or 'НЕ НАЙДЕНА'}")
    (ROOT / rel).write_bytes(snap)
    assert (ROOT / rel).read_bytes() == snap, f"{rel}: откат не сошёлся байт в байт"
    code2, out2 = run()
    print(f"  после отката: код {code2} ({'зелёный' if code2 == 0 else 'НЕ ЗЕЛЁНЫЙ — откат испорчен'})")
    passed = code != 0 and line is not None and code2 == 0
    print(f"  ИТОГ: {'красный, как надо' if passed else 'ПРОВАЛ'}")
    return passed


def delete_mutation(name, rel, must_see):
    """Порча удалением файла. Отдельная функция, потому что apply() правит
    текст, а тут файла просто не должно быть."""
    print(f"\n=== {name} ===")
    p = ROOT / rel
    snap = p.read_bytes()
    p.unlink()
    try:
        assert not p.exists(), f"{rel}: файл не удалился — порча не состоялась"
    except BaseException:
        p.write_bytes(snap)
        raise
    code, out = run()
    line = next((l for l in out.splitlines() if must_see in l), None)
    print(f"  правка: удалён {rel}")
    print(f"  код возврата: {code} ({'ожидаемо' if code != 0 else 'НЕОЖИДАННО — сторож зелёный!'})")
    print(f"  строка сторожа: {line or 'НЕ НАЙДЕНА'}")
    p.write_bytes(snap)
    assert p.read_bytes() == snap, f"{rel}: откат не сошёлся байт в байт"
    code2, _ = run()
    print(f"  после отката: код {code2} ({'зелёный' if code2 == 0 else 'НЕ ЗЕЛЁНЫЙ — откат испорчен'})")
    passed = code != 0 and line is not None and code2 == 0
    print(f"  ИТОГ: {'красный, как надо' if passed else 'ПРОВАЛ'}")
    return passed


code0, out0 = run()
assert code0 == 0, f"база не зелёная до порч:\n{out0}"
print("база: сторож зелёный (код 0)")

results = [
    mutation("Порча 1: у /ru/ нет canonical",
             "ru/index.html", '  <link rel="canonical" href="https://zhdanov.pw/ru/" />\n', "", 1,
             "/ru/: нет canonical"),
    mutation("Порча 2: у / нет hreflang x-default",
             "index.html", '  <link rel="alternate" hreflang="x-default" href="https://zhdanov.pw/" />\n', "", 1,
             '/: нет hreflang="x-default"'),
    mutation("Порча 3: у /ru/ нет og:image",
             "ru/index.html", '  <meta property="og:image" content="https://zhdanov.pw/assets/og.png" />\n', "", 1,
             "/ru/: нет og:image"),
    mutation("Порча 4: в /ru/ вернулась английская строка из словаря",
             "ru/index.html", RU_TEXT, EN_TEXT, 1,
             "осталась английская строка"),
    mutation("Порча 5: nginx снова откатывает на главную (мягкая 404)",
             "nginx.conf", "try_files $uri $uri/ =404;", "try_files $uri $uri/ /index.html;", 1,
             "несуществующий адрес"),
    delete_mutation("Порча 6: файла подтверждения Google нет в репозитории",
                    "googlef135278a92d1749a.html",
                    "файл подтверждения Google -> 200"),
    mutation("Порча 7: Dockerfile не копирует файл подтверждения",
             "Dockerfile", " googlef135278a92d1749a.html", "", 1,
             "не копирует googlef135278a92d1749a.html"),
]

final, fout = run()
print(f"\nбаза после всех откатов: код {final} — {fout.strip()}")
bad = results.count(False) + (final != 0)
n = len(results)
print(f"\n{'ИТОГ: все ' + str(n) + ' порч красные, база зелёная' if bad == 0 else f'ИТОГ: ПРОВАЛ (провалено {bad})'}")
sys.exit(1 if bad else 0)
