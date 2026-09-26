# قاعدة بيانات جديدة من الصفر

هذه النسخة ليست Upgrade للـD1 القديمة؛ هي Fresh Install.

- لا يوجد `database_id` محفوظ مسبقًا.
- لا يتم استيراد أي Subjects أو Resources أو Announcements قديمة.
- لا يتم نقل حسابات Admin القديمة.
- أول Owner يتم إنشاؤه من واجهة الموقع بعد النشر.
- Schema البداية موجود كاملًا في ملف واحد: `migrations/0001_initial.sql`.
- القاعدة القديمة لا تُحذف تلقائيًا.

## Windows

شغّل `START-FRESH-DATABASE.bat`.

## يدويًا

يمكن تنفيذ الخطوات التالية بدل الملف الآلي:

```bash
npm install
npx wrangler d1 create YOUR_NEW_DB_NAME --location weur --binding DB --update-config
npx wrangler d1 execute DB --remote --file migrations/0001_initial.sql --yes
npm run validate
npx wrangler deploy
```
