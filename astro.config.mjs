import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// GEO Lab — 研究机构 + 科技媒体风格的内容门户。
// 静态优先：页面默认 SSG 输出完整 HTML，交互模块按需加载为 React Island。
export default defineConfig({
  site: 'https://geolab.dev',
  trailingSlash: 'ignore',
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
