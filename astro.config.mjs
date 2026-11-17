import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// GEO Lab — 研究机构 + 科技媒体风格的内容门户。
// 内容页全部预渲染（静态产物可直接托管）；只有 /benchmark 与 /api 按需渲染，
// 因为它们要读写服务端的可见性监测数据。
export default defineConfig({
  site: 'https://geolab.dev',
  trailingSlash: 'ignore',
  adapter: node({ mode: 'standalone' }),
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
