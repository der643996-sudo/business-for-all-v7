# Verify

Run:

```bash
npm run validate
```

Expected: all tests pass.

Then after deploy open:

```text
/api/health
```

Expected fields include:

```json
{"ok":true,"version":"8.0.0","stage":"ready"}
```
