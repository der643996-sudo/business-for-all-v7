# No R2 Architecture

هذه النسخة لا تستخدم R2 نهائيًا.

- لا يوجد `r2_buckets` داخل `wrangler.jsonc`.
- لا يوجد Binding للملفات داخل Worker.
- لا توجد API لرفع ملفات.
- لا ينشئ `START-NO-R2.bat` أي R2 Bucket.
- D1 يخزن روابط HTTPS وmetadata فقط.

إذا احتجت ملفًا جديدًا: ارفعه إلى مزود خارجي ثم أضف الرابط من لوحة الإدارة.
