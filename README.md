# zhdanov.pw — Personal Landing Page

Персональный лендинг на Caddy + Docker с автоматическим HTTPS (Let's Encrypt).

## 🚀 Деплой одной командой

```bash
docker compose up -d --build
```

Caddy автоматически:
- Получит SSL-сертификат для `zhdanov.pw` и `www.zhdanov.pw`
- Настроит редирект `www` → без `www`
- Будет автоматически обновлять сертификат

## 📋 Требования

- Docker + Docker Compose
- Открытые порты **80** и **443** на сервере
- DNS `A`-запись домена `zhdanov.pw` → IP сервера

## 🛠 Команды

```bash
# Запуск
docker compose up -d --build

# Логи
docker compose logs -f

# Остановка
docker compose down

# Обновить сайт (после правок index.html)
docker compose up -d --build
```

## 📁 Структура

```
zhdanov.pw/
├── index.html        # Сайт
├── Caddyfile         # Конфиг Caddy (автоматический HTTPS)
├── Dockerfile        # Образ
├── docker-compose.yml
└── .dockerignore
```
