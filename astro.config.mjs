import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import netlify from '@astrojs/netlify';
import tailwindcss from '@tailwindcss/vite';

// GEO Lab — 研究机构 + 科技媒体风格的内容门户。
// 内容页全部预渲染（静态产物由 CDN 直接托管）；只有 /benchmark 与 /api 按需渲染，
// 因为它们要读写服务端的可见性监测数据。
// 部署目标：Netlify —— 静态页发布到 dist/，按需路由编译成 Netlify Function。
export default defineConfig({
  // 上线域名以 SITE_URL 环境变量为准；本地与默认值保持 geolab.dev。
  site: process.env.SITE_URL ?? 'https://geolab.dev',
  trailingSlash: 'ignore',
  adapter: netlify(),
  integrations: [
    mdx(),
    react(),
    sitemap({
      i18n: undefined,
      filter: (page) => !page.includes('/search/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      // node:sqlite 是运行时内置模块，不能被 Vite 打包
      external: ['node:sqlite'],
    },
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-dimmed' },
      wrap: true,
    },
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
