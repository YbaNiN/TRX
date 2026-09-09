-- Run in the SQL editor. All fixtures are rolled back; no email is sent.
BEGIN;
DO $test$
DECLARE
  ids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  prefix text := 'trx_signup_check_' || replace(gen_random_uuid()::text, '-', '');
BEGIN
  -- Same email prefix without metadata (the original failure).
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (ids[1], prefix || '@example.invalid', '{}'::jsonb),
    (ids[2], prefix || '@other.invalid', '{}'::jsonb);
  -- Same requested username, including metadata that must never grant admin.
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (ids[3], prefix || '3@example.invalid', jsonb_build_object('username', prefix, 'role', 'admin')),
    (ids[4], prefix || '4@example.invalid', jsonb_build_object('username', prefix));
  IF (SELECT count(DISTINCT username) FROM public.profiles WHERE id = ANY(ids)) <> 4 THEN
    RAISE EXCEPTION 'Expected four distinct usernames';
  END IF;
  IF (SELECT count(*) FROM public.profiles WHERE id = ANY(ids) AND display_name = prefix AND role = 'user') <> 4 THEN
    RAISE EXCEPTION 'Display name or safe default role did not match';
  END IF;
  IF (SELECT count(*) FROM public.user_settings WHERE user_id = ANY(ids)) <> 4 THEN
    RAISE EXCEPTION 'Settings trigger did not create all four rows';
  END IF;
END;
$test$;
ROLLBACK;
SELECT 'PASS: duplicate prefixes and names; default roles; settings; fixtures rolled back' AS result;
