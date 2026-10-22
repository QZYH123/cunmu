# Changelog

[中文](CHANGELOG.md)

## 0.2.0

Mostly fixes: data safety, imports and sync, and a few serious problems on specific platforms. Everyone should update, Android users especially.

### Important fixes

- Android: tapping 换掉 (Replace) after 从文件恢复 (Restore from file) did nothing. Restoring now works. The same cause made connecting Bangumi with a personal token and saving a Steam key hang; both are fixed.
- Windows: Steam game covers now show.
- Saves: an unreadable or newer save is never overwritten; a failed save is reported; 删除全部内容 (Delete everything) removes every copy.
- Disconnecting Steam now asks first and says the key and the playtime on existing games will go. Games already brought in stay.
- A work's name can no longer be saved empty.

### Import and sync

- Merging an import keeps what you changed yourself.
- Undoing a Steam import also puts back playtime. A read that only moved playtime can be undone, and consecutive re-reads that only move playtime share one undo record.
- Douban spreadsheets are read more accurately. A second Douban row or Steam game matching the same work comes in on its own, and unknown 豆备 labels no longer stop the import.
- Backup files can be dropped onto the window or onto 收录 (Add). An empty Steam library shows as empty. A Bangumi profile link is read as the username.
- A WeRead paste skips highlights already on the book, and says so when nothing new arrived.
- After disconnecting Bangumi or Steam, a read still in progress no longer reconnects. Dates follow your own time zone.
- 来源 (Sources) names the newest import record of each kind.
- The import line on the home page stays until Bangumi, Douban and Steam have all been imported, the library reaches 30 works, or you dismiss it.

### Backup and restore

- Backups carry every referenced picture and Steam cover address, and cover shapes are mended on restore.
- Restoring a JSON file warns when a picture is neither in the file nor on the device.
- Hand-edited backup files are read without breaking pages.
- Exported essay file names are safe on Windows.

### 给人看 (Show mode)

- Works marked 只给自己 (Only me) are hidden in mentions, linked works, 这篇提到了 (Mentioned here) and essay links, and nothing offers to edit them.
- A period with no visible works is not shown.

### Browsing and search

- Going back from an entry opened from search returns to the same results, words and scroll position.
- The cover wall's kind, year and grouping are kept in the address, so going back returns to them.
- Search matches every credit, shows the original title when that is why a row matched, treats full-width and half-width characters alike, leaves Enter and Esc to an input method still composing, and no longer offers to add a work from an empty search.
- Grouping by genre lists a work under each of its genres. Undated works sort last and say the date is unknown.
- Long index lists can be expanded instead of being cut off, and a period page shows all its works.
- 设置 (Settings) opens at once even in a large library.
- Broken links (a year that is not a number, a deleted essay) no longer break the page.
- The home page and essay lists show the picture in an essay.

### Writing

- Switching away while writing an essay no longer loses text or pictures added meanwhile.
- An essay's title is no longer copied into its body.

### Interface and wording

- 一直喜欢的 on the home page is now called 兴趣 (Interests), the name used everywhere else.
- Wording across the app is unified and clearer.
- Secondary and quiet text has more contrast, long titles wrap to a second line, and text on covers stays legible.
- Long words and links wrap, and narrow phones never scroll sideways.

### Keyboard and screen readers

- Counts and notices are read by screen readers; the search box and sliders say what they are.
- Focus stays inside an open sheet.
- Home, End and the arrow keys behave consistently on cover walls; Command works like Control on a Mac; / does not open search while the shortcut help is open.

### Downloads

- Android: the signing certificate's SHA-256 starts with `a7fefb05`, so it installs over the previous version.
- Windows: an installer and a portable build. Neither is signed yet, so Windows warns on first run.

## 0.1.0

First public release.
