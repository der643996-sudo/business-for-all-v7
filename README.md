# Business For All v9 — Fresh D1 Target / No R2

**D1 ID:** `5bcf36c6-e1fc-47d4-8431-6d1fc1c8aa5a`

On Windows, run **`START.bat`** to reset the known Business For All tables in this D1, recreate the clean v9 schema, validate, and deploy. This is the requested fresh-start path.

If you ever need to keep existing data, use **`START-KEEP-DATA.bat`** instead.

No R2 bucket is created or used.

---

# Business For All v9.0 — No R2 Edition

نسخة كاملة تعمل على **Cloudflare Workers + D1 + Static Assets** فقط. لا يوجد R2 ولا يتم إنشاء Bucket ولا رفع ملفات إلى Cloudflare.

## التشغيل الأسرع على Windows

فك الضغط ثم شغّل:

```text
START-NO-R2.bat
```

السكريبت ينفّذ تلقائيًا:

1. `npm install`
2. إنشاء قاعدة **D1 جديدة من الصفر** باسم فريد.
3. ربطها بالمشروع باسم `DB`.
4. تطبيق `migrations/0001_initial.sql`.
5. تشغيل فحص JavaScript والاختبارات.
6. نشر Worker والواجهة.

إذا Wrangler طلب تسجيل الدخول، نفّذ مرة واحدة:

```bash
npx wrangler login
```

ثم شغّل الملف من جديد.

## أول زيارة

ستظهر شاشة إنشاء **Owner**. بعد إنشاء المالك يمكنك الدخول إلى لوحة الإدارة.

## ما الجديد في v9

- No R2 بالكامل — D1 للبيانات وروابط HTTPS خارجية للملفات.
- رابط أساسي + رابطان احتياطيان لكل ملف.
- Link Checker للرابط الأساسي والروابط الاحتياطية.
- Tags، تثبيت الملفات، تاريخ انتهاء اختياري، وعدّاد فتح.
- Bulk Import من CSV حتى 200 ملف في العملية الواحدة.
- Trash: حذف مرن + استرجاع + حذف نهائي.
- Owner / Admin / Editor وصلاحيات مختلفة.
- إدارة فريق الإدارة من حساب Owner.
- Backup / Restore JSON للمحتوى والإعدادات.
- Maintenance Mode للطلاب مع بقاء لوحة الإدارة متاحة.
- PWA + Service Worker.
- مفضلة وRecently Viewed محليًا على جهاز الطالب بدون حساب.
- QR لكل ملف.
- بحث وفلاتر للمستوى والفصل والقسم ونوع المحتوى والوسوم.
- Dark Mode وتصميم Responsive.
- Security Headers + HTTPS-only external links + منع private/local IPs.
- فحص الروابط لا يتبع redirects، لتقليل مخاطر SSRF.

## بنية التخزين

### D1

يحتفظ فقط بالبيانات الوصفية:

- `admins`
- `sessions`
- `subjects`
- `resources`
- `announcements`
- `settings`
- `audit_logs`

### الملفات

الملفات نفسها تكون في خدمات خارجية مثل Google Drive أو OneDrive أو Dropbox أو GitHub أو أي رابط HTTPS عام. D1 يحتفظ بالرابط فقط.

## تنسيق Bulk Import

```csv
subject_code,title,url,type,content_type,tags,mirror_url_1,mirror_url_2
ACC101,Chapter 1,https://example.com/file.pdf,PDF,lectures,"chapter1, important",,
```

الأعمدة الأساسية: `subject_code`, `title`, `url`.

## الصلاحيات

- **Owner**: كل الصلاحيات + إدارة الفريق.
- **Admin**: المحتوى + الإعدادات + Backup/Restore + Trash.
- **Editor**: إدارة المواد والملفات والإعلانات والاستيراد فقط.

## أوامر مفيدة

```bash
npm install
npm run validate
npm run dev
npm run db:init:remote
npm run deploy
```

بعد النشر:

```text
/api/health
/api/diagnostics
/api/bootstrap/status
```

`/api/health` يجب أن يعرض `ok: true`. تفاصيل البنية الداخلية موجودة داخل لوحة الإدارة فقط.

## فتح الملفات في نافذة مستقلة

من v9.0.0 يفتح كل ملف أو رابط احتياطي في نافذة متصفح مستقلة خاصة به، مع إبقاء المنصة مفتوحة. إذا منع المتصفح النوافذ المنبثقة، يتم استخدام تبويب جديد تلقائيًا.
