# Business For All v7.1 — Fresh Database Edition

هذه النسخة تبدأ **قاعدة البيانات من الصفر بالكامل**. لا يوجد داخل `wrangler.jsonc` أي `database_id` قديم، ولا توجد جداول `v3_*` أو migrations قديمة.

## أسرع تشغيل على Windows

فك الضغط ثم شغّل:

```text
START-FRESH-DATABASE.bat
```

الملف ينفّذ بالترتيب:

1. تثبيت dependencies.
2. إنشاء **D1 جديدة تمامًا** باسم فريد في Western Europe.
3. ربطها بالـWorker باسم `DB` وتحديث `wrangler.jsonc` تلقائيًا.
4. إنشاء الـschema النظيف من `migrations/0001_initial.sql`.
5. تشغيل الاختبارات.
6. نشر الـWorker.

إذا Wrangler طلب تسجيل دخول، نفّذ مرة واحدة:

```bash
npx wrangler login
```

ثم شغّل `START-FRESH-DATABASE.bat` من جديد.

## أول دخول

بعد النشر افتح الموقع. قاعدة البيانات ستكون فارغة من المستخدمين والمواد والملفات والإعلانات. ستظهر شاشة **إنشاء حساب Owner** في أول تشغيل فقط.

## الجداول الجديدة

- `admins`
- `sessions`
- `subjects`
- `resources`
- `announcements`
- `settings`
- `audit_logs`

## مهم

السكريبت ينشئ قاعدة جديدة ولا يحذف قاعدة Cloudflare القديمة. هذا يمنع فقد البيانات القديمة بالخطأ. إذا أردت حذف القاعدة القديمة لاحقًا افعل ذلك يدويًا من Cloudflare بعد التأكد من النسخة الجديدة.

## أوامر مفيدة

```bash
npm install
npm run validate
npm run dev
npm run db:init:remote
npm run deploy
```

فحص الاتصال بعد النشر:

```text
/api/health
/api/diagnostics
/api/bootstrap/status
```
