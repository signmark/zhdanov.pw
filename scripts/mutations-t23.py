#!/usr/bin/env python3
"""Порчи для task #23 (хвост #17 по zhdanov.pw).

Две правки: относительный Location в редиректе и метка версии у CSS.
Проверяем и исходники, и живой nginx — потому что половина этих правок
не видна в файлах: «absolute_redirect off» в конфиге и то, что nginx
реально отдаёт в заголовке, — разные вещи.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECKS = [
    ["node", "scripts/check-seo.mjs"],
    ["bash", "scripts/check-server.sh"],
]

MUTATIONS = []


def mutation(name):
    def deco(fn):
        MUTATIONS.append((name, fn))
        return fn

    return deco


@mutation("из nginx.conf убрали absolute_redirect off")
def _m1(root):
    f = root / "nginx.conf"
    h = f.read_text(encoding="utf-8")
    assert "absolute_redirect off;" in h
    f.write_text(h.replace("    absolute_redirect off;\n", "", 1), encoding="utf-8")


@mutation("вместо пути в Location попал абсолютный адрес")
def _m2(root):
    f = root / "nginx.conf"
    h = f.read_text(encoding="utf-8")
    old = 'if ($arg_lang = "ru") { return 301 /ru/; }'
    assert old in h
    f.write_text(h.replace(old, 'if ($arg_lang = "ru") { return 301 http://zhdanov.pw/ru/; }', 1), encoding="utf-8")


@mutation("со ссылок на CSS сняли метку версии")
def _m3(root):
    n = 0
    for rel in ("index.html", "ru/index.html"):
        f = root / rel
        h = f.read_text(encoding="utf-8")
        if "?v=" not in h:
            continue
        f.write_text(h.replace("/assets/site.css?v=e7812390", "/assets/site.css"), encoding="utf-8")
        n += 1
    assert n == 2, "ссылки на CSS не найдены — порча не про то"


@mutation("CSS поправили, а метку на страницах забыли пересчитать")
def _m4(root):
    f = root / "assets/site.css"
    h = f.read_text(encoding="utf-8")
    f.write_text(h + "\n/* t23 */\n", encoding="utf-8")


@mutation("метку в разметке сделали чужой")
def _m5(root):
    f = root / "index.html"
    h = f.read_text(encoding="utf-8")
    f.write_text(h.replace("/assets/site.css?v=e7812390", "/assets/site.css?v=deadbeef"), encoding="utf-8")


@mutation("кеш CSS убрали совсем, чтобы стиль обновлялся")
def _m6(root):
    f = root / "nginx.conf"
    h = f.read_text(encoding="utf-8")
    h = h.replace("        expires 30d;", "        expires 0;", 1)
    assert "expires 0;" in h
    f.write_text(h, encoding="utf-8")


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def main():
    # порчи правят файлы в репозитории — работаем на слепке, а не на рабочем
    # дереве: иначе один прогон оставляет за собой сломанный конфиг
    tmp = Path(tempfile.mkdtemp(prefix="t23-"))
    for item in ("nginx.conf", "index.html", "ru", "assets", "scripts", "i18n", "404.html",
                 "robots.txt", "sitemap.xml", "googlef135278a92d1749a.html", "Dockerfile"):
        src = ROOT / item
        if src.exists():
            dst = tmp / item
            if src.is_dir():
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)
    (tmp / "package.json").write_text((ROOT / "package.json").read_text(encoding="utf-8"), encoding="utf-8")

    base = [run(c, cwd=tmp) for c in CHECKS]
    if any(r.returncode != 0 for r in base):
        print("БАЗА КРАСНАЯ — сначала чиним её")
        for r in base:
            print(r.stdout, r.stderr)
        return 1
    print(f"база зелёная: {', '.join(c[1] for c in CHECKS)}")

    # эталонный слепок: каждая порча начинается с него, иначе правки
    # накапливаются от прогона к прогону и результат перестаёт значить
    pristine = Path(tempfile.mkdtemp(prefix="t23-pristine-"))
    shutil.copytree(tmp, pristine, dirs_exist_ok=True)

    def restore():
        for item in pristine.iterdir():
            if item.is_dir():
                shutil.rmtree(tmp / item.name, ignore_errors=True)
                shutil.copytree(item, tmp / item.name)
            else:
                shutil.copy2(item, tmp / item.name)

    for name, fn in MUTATIONS:
        print(f"\nпорча: {name}")
        restore()
        fn(tmp)
        caught = [c for c in CHECKS if run(c, cwd=tmp).returncode != 0]
        if caught:
            print(f"  КРАСНЫЙ ({', '.join(c[1] for c in caught)})")
        else:
            print("  ОСТАЛСЯ ЗЕЛЁНЫМ — порча непоймана")

    restore()
    back = [run(c, cwd=tmp) for c in CHECKS]
    print("\n" + ("после мутаций всё зелено" if all(r.returncode == 0 for r in back) else "ПОСЛЕ МУТАЦИЙ КРАСНЫЙ"))
    return 0 if all(r.returncode == 0 for r in back) else 1


if __name__ == "__main__":
    sys.exit(main())
