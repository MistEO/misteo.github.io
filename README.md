# 肝！

MistEO 的博客，[misteo.top](https://misteo.top)。

Hexo 8 + [hexo-theme-material](https://github.com/viosey/hexo-theme-material) 1.5.2。

## 分支

- `source`：博客源码。文章在 `source/_posts`，改这里。
- `pages`：生成后的静态站，GitHub Pages 发布这一支，域名 `misteo.top`。

推送到 `source` 后，GitHub Actions 会执行 `hexo generate`，并把 `public/` 提交到 `pages`。

本地预览：

```bash
npm install
npm run server
```
