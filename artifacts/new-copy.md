# 新文案草稿

负责人定稿。下面每条都是这次为了把事情说清楚先放上去的句子，清楚优先于风格。已有句子没有改措辞。

## 断开 Steam 之前

- 文件：`src/pages/Me.tsx` 464，文案在 `src/data/steamOff.ts` 6–9，按钮在 `src/pages/Me.tsx` 470–471
- 场景：设置里点「断开 Steam」。先弹出确认，点「断开」才删 Key、清时长。
- 草稿：
  - 标题：断开 Steam
  - 会删掉：Steam Web API Key 会从这台设备删掉。
  - 会删掉：记在原有游戏上的时长会去掉。
  - 会留下：从 Steam 搬来的游戏还在。
  - 危险按钮：断开
  - 取消：先不断开

## 只恢复 JSON 时

- 文件：`src/components/DataSheets.tsx` 69，句子在 `src/data/backupImages.ts` 2
- 场景：导出全部内容，JSON 那一条说明。
- 草稿：记录在 JSON 里。自己加的图片在同一份 ZIP 的「图片」文件夹里，要一起导回。

- 文件：`src/pages/Me.tsx` 221–222，句子在 `src/data/backupImages.ts` 53
- 场景：从文件恢复之后。引用的图既不在这份文件里，这台设备上也没有，才在原来的「恢复了 N 条」或「恢复好了」后面加上这一句。图在 ZIP 里，或本来就在这台设备上，不加。
- 草稿：有的图片不在这个文件里，封面会空着。
- 接在句号后面，例如：恢复了 1 条。有的图片不在这个文件里，封面会空着。

## 摘抄已经在了

- 文件：`src/data/quotes.ts` 74；出现在 `src/pages/Connect.tsx` 66、`src/pages/Add.tsx` 131
- 场景：再贴一次微信读书笔记，正文和章节都对得上、没有新的一句。不新建批次。
- 草稿：这些摘抄已经在了

## 名字是空的

- 文件：`src/data/guards.ts` 2；出现在 `src/components/EditWorkSheet.tsx` 97
- 场景：编辑作品时名字框是空的。「好了」不能点，表单不关，名字框下出现这句。
- 草稿：名字还空着

## 索引后面还有

- 文件：`src/pages/IndexPage.tsx` 73、94
- 场景：人物超过 400，或一个兴趣下的作品超过 200。点一下才把剩下的列出来。
- 草稿：还有 N 人
- 草稿：还有 N 条

## Steam 列表是空的

- 文件：`src/pages/SteamConnect.tsx` 238；出现在同文件 83
- 场景：打开的游戏列表里 `games` 是空数组。`response` 是空对象时，仍用原来的隐私说明。
- 草稿：这份列表里没有游戏。

## 网页上不读成就

- 文件：`src/pages/SteamConnect.tsx` 241；设置里 Steam 那一行在 `src/pages/Me.tsx` 136 引用这句
- 场景：网页版已经连过 Steam。不放「读取全部游戏的成就」。手机和 Windows 上不出现这句，按钮还在。
- 草稿：成就要在手机或 Windows 上的存目里读。

## 搜索没有结果

- 文件：`src/lib/searchText.ts` 39；出现在 `src/pages/Search.tsx` 174、`src/components/CommandPalette.tsx` 183
- 场景：搜索框里的词对不上任何条目、人物、兴趣、年份。不再出现「收录《这个词》」。兴趣表单里挑作品时的「这里没有「…」」没动。
- 草稿：没有叫这个的条目

## 整面墙还没有封面

- 文件：`src/pages/FullWall.tsx` 187
- 场景：书库是空的，打开整面墙。某一类被筛成空的，不写这句。
- 草稿：放进作品以后，封面会铺在这里。
