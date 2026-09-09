-- Keep existing accounts untouched. Allocate a unique handle at signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  requested_name text;
  base_name text;
  candidate text;
  conflict_name text;
  attempt integer := 0;
BEGIN
  requested_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'username'), ''),
    nullif(split_part(new.email, '@', 1), ''), 'usuario');
  base_name := lower(left(requested_name, 64));
  candidate := base_name;
  LOOP
    BEGIN
      INSERT INTO public.profiles (id, username, display_name, role)
      VALUES (new.id, candidate, requested_name, 'user')
      ON CONFLICT (id) DO NOTHING;
      RETURN new;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS conflict_name = CONSTRAINT_NAME;
      IF conflict_name <> 'profiles_username_key' OR attempt >= 10 THEN
        RAISE;
      END IF;
      attempt := attempt + 1;
      candidate := base_name || '_' || replace(new.id::text, '-', '')
        || CASE WHEN attempt > 1 THEN '_' || attempt::text ELSE '' END;
    END;
  END LOOP;
END;
$function$;
