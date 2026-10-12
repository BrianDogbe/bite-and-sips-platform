-- Defence in depth for managed Postgres (e.g. Supabase), where tables in the `public`
-- schema can be exposed through an auto-generated REST API to anon/authenticated keys.
--
-- Bite & Sips never queries the database from the browser: every read and write goes
-- through the server using the database owner role (DATABASE_URL), which bypasses RLS
-- because it owns the tables. Enabling RLS with NO policies therefore denies all access
-- through any other role (anon / authenticated) while leaving the application unaffected.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
