-- Roles enum
CREATE TYPE public.app_role AS ENUM ('entregador', 'adm', 'adm_principal');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('adm', 'adm_principal')
  )
$$;

-- Entries (lançamentos, sempre acumulativos: nunca sobrescrever)
CREATE TABLE public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  deliveries integer NOT NULL DEFAULT 0,
  price numeric(10,2) NOT NULL DEFAULT 0,
  extra_income numeric(10,2) NOT NULL DEFAULT 0,
  fuel numeric(10,2) NOT NULL DEFAULT 0,
  maintenance numeric(10,2) NOT NULL DEFAULT 0,
  other_expenses numeric(10,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entries_user_day_idx ON public.entries (user_id, day);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

-- Reports (histórico de relatórios gerados)
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  report_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_type, period_start, period_end)
);
GRANT SELECT, INSERT, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Policies: profiles
CREATE POLICY "Users read own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins read all profiles" ON public.profiles
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid());

-- Policies: user_roles
CREATE POLICY "Users read own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read all roles" ON public.user_roles
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- Policies: entries (entregador manages own; admin read-only)
CREATE POLICY "Deliverers insert own entries" ON public.entries
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND NOT public.is_admin(auth.uid()));
CREATE POLICY "Deliverers read own entries" ON public.entries
FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read all entries" ON public.entries
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Deliverers update own entries" ON public.entries
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND NOT public.is_admin(auth.uid()))
WITH CHECK (user_id = auth.uid());
CREATE POLICY "Deliverers delete own entries" ON public.entries
FOR DELETE TO authenticated
USING (user_id = auth.uid() AND NOT public.is_admin(auth.uid()));

-- Policies: reports
CREATE POLICY "Users manage own reports" ON public.reports
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins read all reports" ON public.reports
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- Auto profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'entregador')
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
