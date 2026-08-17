# http64
Устойчивый к детекту и блокировкам протокол проксирования.

## HTTP/HTTPS-прокси на Node.js с маскировкой трафика через Base64.

## Схема работы

Браузер ──> client.js ── Base64 ──> server.js ──> Целевой сайт


## Запуск

1. Разрешите запуск скрипта сервера:
   ```bash
   chmod +x run_server.sh
   ```

2. Запустите сервер:
   ```bash
   ./run_server.sh
   ```

3. Запустите клиент:
   ```bash
   node client.js
   ```

## Проверка

```bash
curl -x http://127.0.0.1:8080 http://codedroider.github.io
```
