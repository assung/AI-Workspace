# 成員大頭照(src/assets/avatars)

App.tsx 的 `AVATAR` 以檔名(= 成員 key)讀取;128×128 JPEG,由原圖置中裁成正方形(Wu Jing 另裁頭肩)。

| 來源 | 授權 | 檔案 |
|---|---|---|
| [tabler/tabler](https://github.com/tabler/tabler) `shared/static/avatars/` | MIT | 除下列外全部 |
| [themesberg/flowbite-admin-dashboard](https://github.com/themesberg/flowbite-admin-dashboard) `static/images/users/` | MIT | `me.jpg`(robert-brown)、`g-xia.jpg`(helene-engels) |

挑選原則(2026-10-27):辦公 / 專業感的一般人大頭照,依名字對應性別與大致族裔;避開看起來像知名人士的照片;每人一張、不重複。


IT Service Desk demo 加的(2026-11-23 user:「幫我把 Bob 跟 Aaron 都提供一個人像 avatar」):
- `bob.jpg` = tabler `016m.jpg`(值班者 Bob;同上原則挑一張沒用過、不像名人的)
- 報案者 Aaron = 這個 Chat 的「我」→ 沿用 `me.jpg`,IT Service Desk 的頻道訊息也用同一張(同一個人兩邊同一張臉)
