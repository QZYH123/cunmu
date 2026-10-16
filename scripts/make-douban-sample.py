#!/usr/bin/env python3
"""
A small 豆伴 / douban-backup style workbook for the prototype's 豆瓣备份导入 and the smoke test.

PROVISIONAL: the layout follows douban-backup's README (TECH-PLAN v0.3 §4.4.1) — one sheet per
type/status, 9 fixed headers — and still waits for a real export (DECISIONS-r2 item 19).
Run: python3 scripts/make-douban-sample.py  →  scripts/fixtures/douban-sample.xlsx
"""
from pathlib import Path
from openpyxl import Workbook

HEAD = ['标题', '简介', '豆瓣评分', '链接', '创建时间', '我的评分', '标签', '评论', '可见性']
S = 'https://book.douban.com/subject/{}/'
M = 'https://movie.douban.com/subject/{}/'
SHEETS = {
    '看过': [
        ['漫长的季节', '2023 / 中国大陆 / 剧情 犯罪 悬疑 / 辛爽 / 范伟 秦昊 陈明昊', 9.4, M.format(35588177), '2023-05-20 23:41:08', 5, '国产剧', '往前看，别回头。', 'public'],
        ['花样年华', '2000 / 中国香港 / 剧情 爱情 / 王家卫 / 梁朝伟 张曼玉', 8.8, M.format(1291557), '2021-11-03 21:12:40', 5, '', '', 'public'],
        ['一一', '2000 / 中国台湾 日本 / 剧情 家庭 / 杨德昌 / 吴念真 李凯莉', 9.1, M.format(1292434), '2022-02-14 00:20:11', 5, '', '我们看到的永远只有一半。', 'private'],
        ['爱乐之城', '2016 / 美国 / 剧情 爱情 歌舞 / 达米恩·查泽雷 / 瑞恩·高斯林 艾玛·斯通', 8.4, M.format(25934014), '2017-02-25 20:05:33', 4, '', '', 'public'],
    ],
    '在看': [
        ['繁花', '2023 / 中国大陆 / 剧情 / 王家卫 / 胡歌 马伊琍', 8.7, M.format(35350794), '2024-01-02 22:00:00', '', '', '', 'public'],
    ],
    '想看': [
        ['燃烧', '2018 / 韩国 / 剧情 悬疑 / 李沧东 / 刘亚仁', 7.9, M.format(26842702), '2019-03-01 10:00:00', '', '', '', 'public'],
    ],
    '读过': [
        ['我与地坛', '史铁生 / 人民文学出版社 / 1991', 9.2, S.format(1209899), '2020-04-02 22:18:00', 5, '散文', '园子还在。', 'public'],
        ['海边的卡夫卡', '[日] 村上春树 / 林少华 / 上海译文出版社 / 2003', 8.2, S.format(1009225), '2016-07-30 13:45:10', 4, '', '', 'public'],
        ['长安的荔枝', '马伯庸 / 湖南文艺出版社 / 2022', 8.5, S.format(35957952), '2023-03-11 09:30:00', 4, '', '一骑红尘妃子笑。', 'public'],
        ['置身事内', '兰小欢 / 上海人民出版社 / 2021', 9.1, S.format(35546622), '2022-08-19 23:05:42', 5, '', '', 'public'],
        ['额尔古纳河右岸', '迟子建 / 人民文学出版社 / 2005', 8.9, S.format(1919361), '2019-12-24 20:20:20', '', '', '', 'public'],
    ],
    '想读': [
        ['百年孤独', '[哥伦比亚] 加西亚·马尔克斯 / 范晔 / 南海出版公司 / 2011', 9.3, S.format(6082808), '2018-01-01 08:00:00', '', '', '', 'public'],
    ],
    '听过': [
        ['万能青年旅店', '万能青年旅店 / 2010 / 专辑 / CD / 摇滚', 9.2, 'https://music.douban.com/subject/4751563/', '2018-06-09 01:02:03', 5, '', '', 'public'],
    ],
    '玩过': [
        ['极乐迪斯科', '2019-10-15 / ZA/UM Studio / 角色扮演', 9.4, 'https://www.douban.com/game/30347464/', '2021-01-20 02:10:00', 5, '', '', 'public'],
    ],
    '看过的舞台剧': [
        ['恋爱的犀牛', '孟京辉 / 廖一梅 / 1999', 8.6, 'https://www.douban.com/location/drama/19992497/', '2015-09-12 22:30:00', 4, '', '', 'public'],
    ],
}

wb = Workbook()
wb.remove(wb.active)
for name, rows in SHEETS.items():
    ws = wb.create_sheet(name)
    ws.append(HEAD)
    for r in rows:
        ws.append(r)
out = Path(__file__).parent / 'fixtures' / 'douban-sample.xlsx'
out.parent.mkdir(exist_ok=True)
wb.save(out)
print(out)
