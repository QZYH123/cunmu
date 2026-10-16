# 参与存目 · Contributing

谢谢愿意帮忙。下面是这个项目的几条规矩，大部分会由 `npm run verify` 自动检查。
*(English summary at the end.)*

## 开始之前

- Node 22。`npm install` 会把 git 的 pre-commit hook 指向 `.githooks/`，每次提交都会跑 `npm run verify`（类型检查、构建、设计规则检查、单元测试、浏览器冒烟测试），CI 也会对每个 PR 跑同样的检查。
- 改界面就附上前后对比截图（手机 390–412 宽、电脑 1440 宽，浅色和深色都要）。
- 一个提交只做一件事，提交说明写清楚做了什么、为什么。

## 文案规矩（存目怎么说话）

存目是一份私人的收藏记录，不是运营页面，也不是打卡工具。界面里的文字：

- **平实、具体、不催人。** 不用感叹号，不夸人，不卖东西。不说「哦、呢、啦、呀」。
- **禁用词**：
  - 压力类：连续、打卡、天没、暂无、完善、等级、目标、加油、太棒了、你已经……
  - 补全和报告类：待补全、去补全、未整理、未归类、缺少日期、年度报告、比去年、已删除、保存成功、心情……
  - 推销类：百科、成功、失败、一键、立即、宝藏、珍藏、回忆、时光、岁月、专属、惊喜……
  - 家具类：书房、家具、书架、柜子、唱片架、游戏柜、海报墙、档案柜……
  - 自造的「地层」类名字：地层、翻层、一层层、层层、岩层……
- **不画**徽章、红点、进度条、百分比。
- **唯一的例外是游戏**：Steam 的成就是游戏自带的事实，所以只在游戏页的「游玩」一节和「设置 › 来源 › Steam」里，可以说「成就」「解锁」，可以画一条细进度条加百分比（`scripts/check-spec.mjs` 里的 `GAME_EXEMPT`）。别的地方照旧。
- 拿不准的日期写「约」，不知道的就放进「时间未知」，不提醒用户去补。

## 设计规矩

- 颜色、字号、间距、圆角、阴影、时长，只写在 `src/styles/tokens.css`（JS 里用的时长在 `src/tokens.ts`）。其他文件只能引用 token，`npm run check` 会拦住写死的数值。
- 线条一律 1px 的 `--line-*`。不用渐变，除了 token 文件里允许的那几种材质。动效不超过 600ms，并且尊重「减少动态效果」。
- 手机上能点的东西，至少要有 44px 的可点范围，可以是看不见的。

## 数据和隐私

- 不加统计、分析或广告 SDK，不加新的联网目的地，除非同时改「隐私说明」（`src/pages/About.tsx`），并在里面写清楚。
- 令牌和 Key 只能通过 `src/lib/secrets.ts` 保存，绝不能进导出文件，也不能进仓库。
- **仓库里不放有版权的东西**：真实的封面图、书里的原文、别人写的评论或简介、真实用户的数据。仓库里没有演示书库和演示封面；测试数据用编造的，越少越好。`scripts/check-dist.mjs` 会保证测试数据不进正式构建。

## English summary

- Run `npm run verify` (the pre-commit hook and CI both do).
- For UI changes, attach before/after screenshots: phone and desktop, light and dark.
- The interface copy is Chinese, plain and never pushy. `scripts/check-spec.mjs` bans streak, gamification and sales words, plus badges, progress bars and percentages. The one exception is Steam achievements on a game's 游玩 section and in Steam settings.
- Design values live only in `src/styles/tokens.css` / `src/tokens.ts`.
- Don't add new network destinations without updating the privacy page.
- Secrets go only through `src/lib/secrets.ts`, and never into exports or the repo.
- Never commit copyrighted material (real covers, book text, other people's reviews, real users' data).
