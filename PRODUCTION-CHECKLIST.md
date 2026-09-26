# Production Checklist — v7.1 Fresh

- [ ] شغّلت `START-FRESH-DATABASE.bat` بنجاح.
- [ ] `wrangler.jsonc` يحتوي بعد التشغيل على binding باسم `DB` وقاعدة D1 الجديدة.
- [ ] `/api/health` يعيد `ok: true` و`version: 7.1.0`.
- [ ] `/api/diagnostics` يعرض الجداول: admins, sessions, subjects, resources, announcements, settings, audit_logs.
- [ ] `/api/bootstrap/status` يعيد `needsOwner: true` قبل إنشاء أول Owner.
- [ ] أنشأت Owner وسجلت الدخول بنجاح.
- [ ] أضفت مادة وملفًا تجريبيًا ثم حذفتهما.
- [ ] اختبرت الموقع على الهاتف والكمبيوتر.
