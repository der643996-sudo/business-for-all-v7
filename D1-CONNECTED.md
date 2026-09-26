# D1 target

Prepared D1 ID:

`5bcf36c6-e1fc-47d4-8431-6d1fc1c8aa5a`

## Fresh start (requested)
Run `START.bat` on Windows.

It resolves the database name from the fixed D1 ID, binds it as `DB`, drops only the known Business For All application tables, recreates the clean v8 schema, validates, and deploys. It does not create a new D1 database and does not use R2.

## Keep existing data
Run `START-KEEP-DATA.bat` if you want to bind the same D1 and apply `CREATE IF NOT EXISTS` without dropping the Business For All tables.
