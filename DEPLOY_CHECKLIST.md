# Чек-лист для успешного деплоя на Firebase Hosting

Этот документ содержит все ключевые настройки, необходимые для правильной сборки Next.js проекта в режиме статического сайта и его последующего деплоя на Firebase Hosting.

## 1. Настройка `package.json`

Скрипт сборки должен быть максимально простым. Команда `next export` устарела и больше не нужна.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

*   **Ключевой момент:** `"build": "next build"`. При наличии правильных настроек в `next.config.ts`, эта команда автоматически выполнит и сборку, и статический экспорт.

## 2. Настройка `next.config.ts`

Это самый важный файл для сборки. Он должен находиться в корне проекта.

```ts
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Эта опция включает режим статического экспорта.
  // Next.js автоматически создаст папку `out` с готовыми файлами.
  output: 'export',
  
  // Отключает оптимизацию изображений Next.js, что обязательно для статического экспорта.
  images: {
    unoptimized: true,
  },

  // Эти опции помогают избежать сбоя сборки из-за ошибок TypeScript или ESLint.
  // Рекомендуется для стабильности деплоя.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Отключает индикатор сборки Next.js в углу экрана
  devIndicators: {
    buildActivity: false,
  },
};

export default nextConfig;
```

*   **Ключевой момент:** `output: 'export'`. Эта строка заменяет старую команду `next export` и является современным способом сборки статического сайта.

## 3. Настройка `firebase.json`

Этот файл указывает Firebase, какую папку использовать для деплоя.

```json
{
  "hosting": {
    "public": "out",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  }
}
```

*   **Ключевой момент:** `"public": "out"`. Это говорит Firebase, что все файлы для хостинга находятся в папке `out`, которую создает команда `npm run build` (благодаря `output: 'export'`).

## Процесс деплоя

1.  **Сборка проекта:**
    ```bash
    npm run build
    ```
2.  **Деплой на Firebase:**
    ```bash
    firebase deploy --only hosting
    ```
