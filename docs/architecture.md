# Архитектура расширения

VS Code загружает расширения в Extension Host. Манифест `package.json`
объявляет команду, контекстное меню и параметры настроек. При вызове команды
VS Code активирует расширение через `activate(context)` в `src/extension.js`.
Регистрация команды и панели добавляется в `context.subscriptions` для освобождения.

Поток данных:

```text
Команда VS Code → ввод параметров → validateConfig
  → runner.js → отдельный Node.js / worker.cjs
  → импорт пользовательского модуля
  → benchmark.js: генерация → прогрев → замеры → статистика
  → IPC: прогресс и результат
  → report.js → Webview: SVG-графики и таблица
  → сообщение export → диалог сохранения → JSON / CSV
```

- `configuration.js` преобразует ввод пользователя и объединяет его с настройками.
- `benchmark.js` не зависит от VS Code: это отдельно проверяемое ядро измерений.
- `runner.js` запускает Node.js без командной оболочки, обрабатывает IPC,
  ошибки запуска, аварийный выход, тайм-аут и AbortSignal.
- `worker.cjs` принимает один эксперимент и возвращает результат.
- `report.js` формирует HTML и SVG. Пользовательские строки экранируются.
- `media/report.js` переключает шкалу и передаёт запрос на экспорт в расширение.
- `export.js` формирует CSV; JSON сохраняет конфигурацию и все исходные измерения.

Webview получает доступ только к каталогу `media`, использует Content Security
Policy и nonce для скрипта. Обработчик сообщений принимает только два формата
экспорта, а путь выбирается через системный диалог VS Code.
Запуск отключён в недоверенных рабочих папках.

Расширение не изменяет исследуемый исходный код. Node.js исполняет сохранённый
модуль, поэтому выбранные функции должны быть экспортированы и совместимы с Node.js.
Полный текст функции не извлекается из выделения: это сохраняет её импорты и окружение.

## Использованные API

- [VS Code: команды](https://code.visualstudio.com/api/extension-guides/command)
- [VS Code: Webview](https://code.visualstudio.com/api/extension-guides/webview)
- [Node.js: child_process](https://nodejs.org/api/child_process.html)
- [Node.js: performance.now](https://nodejs.org/api/perf_hooks.html)
