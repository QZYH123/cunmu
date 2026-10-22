<div align="center">

<img src="public/icon-192.png" width="88" height="88" alt="存目图标">

# 存目 · Cunmu

**只存其目，就足以想起。**

那年夏天通宵看完的番，通勤路上读完的书，存档里两百个小时的游戏。<br>
存目把散在各处的记录收成一本书，写的是你。

不用注册，没有广告，只在你自己的设备上。Android · Windows · 开源（GPL-3.0）

[![verify](https://img.shields.io/github/actions/workflow/status/QZYH123/cunmu/verify.yml?branch=main&label=verify)](https://github.com/QZYH123/cunmu/actions/workflows/verify.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)
[![Stars](https://img.shields.io/github/stars/QZYH123/cunmu?style=flat)](https://github.com/QZYH123/cunmu/stargazers)
[![Downloads](https://img.shields.io/github/downloads/QZYH123/cunmu/total?label=downloads)](https://github.com/QZYH123/cunmu/releases)
![Android](https://img.shields.io/badge/Android-7.0%2B-3DDC84?logo=android&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)

**中文** · [English](README.en.md)

<br>

<img src="docs/media/hero.gif" width="288" alt="九秒演示：整面封面墙 → 首页，始于 2017 年 7 月 · 《反叛的鲁路修》 → 《反叛的鲁路修》的条目页">

<sub>整面封面墙 → 写你的首页 → 一部作品 → 「给人看」</sub>

</div>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/hero-dark.png">
  <img src="docs/media/hero-light.png" alt="电脑上的整面封面墙：看过、读过、玩过的作品按年份铺满一屏">
</picture>

## 你已经记了很多年

在 Bangumi 点过「看过」，在豆瓣标过「读过」，Steam 替你记着每个游戏玩了多久。几百条，上千条，散在三四个地方，每一条都只是一行字。

可它们加在一起，是你这些年怎么过来的：哪个夏天迷上了科幻，哪一年总在通勤路上读书，哪部番让你在宿舍坐到天亮。

存目把这些记录读进来，替你写出第一稿：你一直喜欢什么，常遇见哪些名字，有过哪几段日子。你只需要改一句话，挑几部最爱。

## 只存其目

「存目」是《四库全书》里的说法。编书的时候，有些书没有收进全文，只留下书名和一段提要，叫「存其目」。

我们觉得这样就够了。不用写长评，不用打分，留下一个名字、一个日子、一句话。多年以后再看到它，那个夏天就回来了。

## 一本书，三个部分

<table>
<tr>
<td width="33%" valign="top">
<img src="docs/images/phone-home.jpg" alt="首页">

**扉页写的是你**
最爱、兴趣、有名字的几段时期、你自己写下的随笔。都由记录提议，你点一下决定留不留。
</td>
<td width="33%" valign="top">
<img src="docs/images/phone-years-spines.jpg" alt="按年份的书架">

**每一年都有一排书架**
书、番、电影电视、音乐、游戏，按年份摆好，书脊或封面两种摆法。同一个作者、同一段时期、同一种兴趣，自己会连起来。
</td>
<td width="33%" valign="top">
<img src="docs/images/phone-handover.jpg" alt="给人看">

**合上之前，递给一个人看**
「给人看」只留下你放上首页的东西，标了「只给自己」的不会出现，按住才能退出。也可以存成一张长图。
</td>
</tr>
</table>

### 全部：一面墙，都是你走过来的

所有记录都在「全部」里。最上面是一面封面墙，下面按种类、人物、年份排好；点「整面墙」铺满整屏，右边是年份刻度，一路往回翻。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/all-dark.png">
  <img src="docs/media/all-light.png" alt="「全部」页：顶上一面封面墙，下面是条目数、种类、人物和年份">
</picture>

## 三步，翻开第一页

1. **下载**：到 [Releases](https://github.com/QZYH123/cunmu/releases) 下载 Android 的 `.apk`，或 Windows 的安装版 `Cunmu_…_x64-setup.exe` / 免安装版 `…-portable.exe`。
2. **把记录搬进来**：在「设置 › 来源」里填 **Bangumi** 用户名，或选 **豆瓣** 备份文件（豆伴 / 豆备导出），或填你自己的 **Steam** Web API Key。
3. **翻到首页**：写你的那一页已经起好草稿。改一句话，挑几部最爱。

> 第一个正式版本发布之前，Releases 还是空的，下载数徽章也会显示 0 或 none。Windows 版还没有代码签名，第一次运行可能提示「已保护你的电脑」：点「更多信息 → 仍要运行」。iOS 版以后再说。

<details>
<summary>从源码构建</summary>

需要 Node 22。

```bash
git clone https://github.com/QZYH123/cunmu.git && cd cunmu
npm install
npm run dev       # 开发服务器（空书库，和正式版一样）
npm run verify    # 类型检查、构建、设计规则检查、单元测试、应用冒烟测试
```

Android、Windows、iOS 的打包和代码结构见 [docs/DEVELOPING.md](docs/DEVELOPING.md)。

</details>

## 书里还有什么

- **从各处搬来**：Bangumi（用户名读公开收藏，个人令牌能读私密的，以后自动同步）；豆瓣备份文件（只读文件，不连豆瓣）；微信读书笔记（粘贴）；Steam（游戏、时长、成就）。
- **自己添上**：一个书名、一个链接，或者手动加；短评、摘抄、随笔，可以配图。
- **往回翻**：封面墙、人物、兴趣、时期，每部作品一页；电脑上按 Ctrl K 搜索。
- **记不清也没关系**：拿不准的日子标「约」，想不起来的放进「时间未知」，不催你补全。
- 浅色和深色跟随系统。

## 它只在你手里

- 没有账号，没有存目自己的服务器，不统计你怎么用。
- 记录存在这台设备上。只有你连接了 Bangumi 或 Steam，才会去连它们。
- Bangumi 令牌和 Steam Key 只存在本机，不会进导出文件。
- 随时可以把全部内容导出成 ZIP（数据、Markdown、你加的图片），从文件恢复，或者一次删光。

细节见应用里的「设置 › 隐私说明」。

## 问答

**换手机怎么办？** 在旧设备上导出 ZIP，到新设备上恢复。

**和 Bangumi、豆瓣是什么关系？** 没有关系。存目只读你自己的记录，不往那边写任何东西。

**截图里的封面呢？** 来自 Bangumi 等来源，版权归各自的权利人，只用来展示界面。仓库里不收任何封面文件。

## 一起写

欢迎提 issue 和 PR。动手前请先看 [CONTRIBUTING.md](CONTRIBUTING.md)，里面有文案和设计规则。

## 许可

[GNU GPL 第 3 版或更新版本](LICENSE)，© 2026 Yanagi（QZYH123）。用到的开源软件和字体列在应用的「设置 › 开源许可」里。Bangumi、Steam、豆瓣、微信读书是各自所有者的商标。

## Star 历史

<a href="https://star-history.com/#QZYH123/cunmu&Date">
  <img src="https://api.star-history.com/svg?repos=QZYH123/cunmu&type=Date" alt="Star 历史" width="600">
</a>
