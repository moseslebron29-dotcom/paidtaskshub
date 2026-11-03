
-- ===== Roles =====
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ===== Settings (single row) =====
CREATE TABLE public.app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  activation_fee numeric(12,2) NOT NULL DEFAULT 100,
  min_withdrawal numeric(12,2) NOT NULL DEFAULT 150,
  withdrawal_fee numeric(12,2) NOT NULL DEFAULT 0,
  referral_commission numeric(12,2) NOT NULL DEFAULT 0,
  withdrawals_enabled boolean NOT NULL DEFAULT true,
  support_email text NOT NULL DEFAULT '',
  support_phone text NOT NULL DEFAULT '',
  announcement text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings admin update" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.app_settings (id) VALUES (1);

-- ===== Profiles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  referral_code text NOT NULL UNIQUE,
  referred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  activated boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile own or admin read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profile admin update" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP code := code || substr(alphabet, 1 + floor(random()*32)::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ref_id uuid; ref_code text;
BEGIN
  ref_code := upper(trim(coalesce(NEW.raw_user_meta_data->>'referral_code','')));
  IF ref_code <> '' THEN
    SELECT id INTO ref_id FROM public.profiles WHERE referral_code = ref_code;
  END IF;
  INSERT INTO public.profiles (id, full_name, email, phone, referral_code, referred_by)
  VALUES (
    NEW.id,
    left(coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), 100),
    coalesce(NEW.email, ''),
    left(coalesce(NEW.raw_user_meta_data->>'phone', ''), 20),
    public.gen_referral_code(),
    ref_id
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  IF lower(NEW.email) = 'moseslebron29@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== Tasks =====
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  url text,
  reward numeric(12,2) CHECK (reward IS NULL OR reward >= 0),
  duration_minutes int CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  requires_proof boolean NOT NULL DEFAULT true,
  one_per_user boolean NOT NULL DEFAULT true,
  max_completions int CHECK (max_completions IS NULL OR max_completions > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tasks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks public read active" ON public.tasks FOR SELECT TO anon, authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tasks admin insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tasks admin update" ON public.tasks FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tasks admin delete" ON public.tasks FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===== Submissions =====
CREATE TABLE public.task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','under_review','approved','rejected')),
  proof_text text,
  proof_path text,
  admin_note text,
  reward numeric(12,2),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid
);
CREATE INDEX ON public.task_submissions (user_id, started_at DESC);
CREATE INDEX ON public.task_submissions (status);
GRANT SELECT ON public.task_submissions TO authenticated;
GRANT ALL ON public.task_submissions TO service_role;
ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs own or admin" ON public.task_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ===== Ledger (wallet) =====
CREATE TABLE public.ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('task_reward','referral_reward','withdrawal','withdrawal_refund','adjustment')),
  amount numeric(12,2) NOT NULL,
  ref text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ledger_ref_uq ON public.ledger (user_id, type, ref) WHERE ref IS NOT NULL;
CREATE INDEX ON public.ledger (user_id, id DESC);
GRANT SELECT ON public.ledger TO authenticated;
GRANT ALL ON public.ledger TO service_role;
GRANT USAGE ON SEQUENCE public.ledger_id_seq TO service_role;
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger own or admin" ON public.ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ===== Withdrawals =====
CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  fee numeric(12,2) NOT NULL DEFAULT 0,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','rejected')),
  reference text NOT NULL UNIQUE DEFAULT ('WD' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  mpesa_receipt text UNIQUE,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX wd_open_uq ON public.withdrawals (user_id) WHERE status IN ('pending','processing');
GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wd own or admin" ON public.withdrawals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ===== Activation payments =====
CREATE TABLE public.activation_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  merchant_request_id text,
  checkout_request_id text UNIQUE,
  mpesa_receipt text UNIQUE,
  result_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE UNIQUE INDEX activation_one_paid_uq ON public.activation_payments (user_id) WHERE status = 'paid';
CREATE INDEX ON public.activation_payments (user_id, created_at DESC);
GRANT SELECT ON public.activation_payments TO authenticated;
GRANT ALL ON public.activation_payments TO service_role;
ALTER TABLE public.activation_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ap own or admin" ON public.activation_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ===== Reviews =====
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 600),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  verified boolean NOT NULL DEFAULT false,
  is_sample boolean NOT NULL DEFAULT false,
  publish_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews public approved" ON public.reviews FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "reviews admin update" ON public.reviews FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "reviews admin delete" ON public.reviews FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===== Complaints / support =====
CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.complaints TO authenticated;
GRANT UPDATE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "complaints own or admin read" ON public.complaints FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "complaints own insert" ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'open' AND admin_reply IS NULL);
CREATE POLICY "complaints admin update" ON public.complaints FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== Audit log =====
CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  actor uuid,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===== Helpers =====
CREATE OR REPLACE FUNCTION public.wallet_balance(_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount),0) FROM public.ledger WHERE user_id = _user
$$;

CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
END $$;

-- Wallet summary for the signed-in user
CREATE OR REPLACE FUNCTION public.my_wallet()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  RETURN json_build_object(
    'balance', public.wallet_balance(u),
    'total_earned', COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id=u AND type IN ('task_reward','referral_reward') ),0)
                  + COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id=u AND type='adjustment' AND amount>0),0),
    'task_earnings', COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id=u AND type='task_reward'),0),
    'referral_earnings', COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id=u AND type='referral_reward'),0),
    'pending_earnings', COALESCE((SELECT SUM(t.reward) FROM task_submissions s JOIN tasks t ON t.id=s.task_id
                          WHERE s.user_id=u AND s.status IN ('submitted','under_review')),0),
    'pending_withdrawals', COALESCE((SELECT SUM(amount+fee) FROM withdrawals WHERE user_id=u AND status IN ('pending','processing')),0),
    'total_withdrawn', COALESCE((SELECT SUM(amount) FROM withdrawals WHERE user_id=u AND status='paid'),0),
    'completed_tasks', (SELECT count(*) FROM task_submissions WHERE user_id=u AND status='approved'),
    'referrals_total', (SELECT count(*) FROM profiles WHERE referred_by=u),
    'referrals_successful', (SELECT count(*) FROM profiles WHERE referred_by=u AND activated)
  );
END $$;

-- Start task
CREATE OR REPLACE FUNCTION public.start_task(_task uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); p profiles; t tasks; sid uuid; done_count int;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  SELECT * INTO p FROM profiles WHERE id = u;
  IF p.status <> 'active' THEN RAISE EXCEPTION 'Your account is suspended'; END IF;
  IF NOT p.activated AND NOT has_role(u,'admin') THEN RAISE EXCEPTION 'Activate your account to start tasks'; END IF;
  SELECT * INTO t FROM tasks WHERE id = _task FOR UPDATE;
  IF NOT FOUND OR NOT t.active THEN RAISE EXCEPTION 'This task is not available'; END IF;
  IF t.reward IS NULL OR t.reward <= 0 THEN RAISE EXCEPTION 'This task opens once its reward is set'; END IF;

  SELECT id INTO sid FROM task_submissions WHERE user_id=u AND task_id=_task AND status IN ('in_progress','submitted','under_review') LIMIT 1;
  IF sid IS NOT NULL THEN RETURN sid; END IF;

  IF t.one_per_user AND EXISTS (SELECT 1 FROM task_submissions WHERE user_id=u AND task_id=_task AND status='approved') THEN
    RAISE EXCEPTION 'You have already completed this task';
  END IF;
  IF t.max_completions IS NOT NULL THEN
    SELECT count(*) INTO done_count FROM task_submissions WHERE task_id=_task AND status <> 'rejected';
    IF done_count >= t.max_completions THEN RAISE EXCEPTION 'This task is full'; END IF;
  END IF;
  INSERT INTO task_submissions (user_id, task_id) VALUES (u, _task) RETURNING id INTO sid;
  RETURN sid;
END $$;

-- Submit task
CREATE OR REPLACE FUNCTION public.submit_task(_submission uuid, _proof_text text, _proof_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); s task_submissions; t tasks;
BEGIN
  SELECT * INTO s FROM task_submissions WHERE id=_submission AND user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
  IF s.status NOT IN ('in_progress','rejected') THEN RAISE EXCEPTION 'Already submitted'; END IF;
  SELECT * INTO t FROM tasks WHERE id = s.task_id;
  _proof_text := left(trim(coalesce(_proof_text,'')), 2000);
  IF _proof_path IS NOT NULL AND _proof_path NOT LIKE (u::text || '/%') THEN RAISE EXCEPTION 'Invalid file'; END IF;
  IF t.requires_proof AND _proof_text = '' AND _proof_path IS NULL THEN RAISE EXCEPTION 'Please add proof of completion'; END IF;
  IF t.duration_minutes IS NOT NULL AND now() - s.started_at < make_interval(secs => LEAST(t.duration_minutes*60, 600) / 2) THEN
    RAISE EXCEPTION 'Please spend more time on the task before submitting';
  END IF;
  UPDATE task_submissions SET status='submitted', proof_text=NULLIF(_proof_text,''), proof_path=_proof_path, submitted_at=now(), admin_note=NULL
   WHERE id=_submission;
END $$;

-- Admin: review submission
CREATE OR REPLACE FUNCTION public.admin_review_submission(_submission uuid, _approve boolean, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s task_submissions; t tasks;
BEGIN
  PERFORM require_admin();
  SELECT * INTO s FROM task_submissions WHERE id=_submission FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF s.status NOT IN ('submitted','under_review') THEN RAISE EXCEPTION 'Submission is not awaiting review'; END IF;
  SELECT * INTO t FROM tasks WHERE id=s.task_id;
  IF _approve THEN
    UPDATE task_submissions SET status='approved', reward=t.reward, reviewed_at=now(), reviewed_by=auth.uid(), admin_note=_note WHERE id=_submission;
    INSERT INTO ledger (user_id, type, amount, ref, note) VALUES (s.user_id, 'task_reward', t.reward, s.id::text, 'Task: ' || t.title);
  ELSE
    UPDATE task_submissions SET status='rejected', reviewed_at=now(), reviewed_by=auth.uid(), admin_note=_note WHERE id=_submission;
  END IF;
  INSERT INTO audit_log (actor, action, detail) VALUES (auth.uid(), CASE WHEN _approve THEN 'submission_approved' ELSE 'submission_rejected' END, _submission::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_mark_under_review(_submission uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM require_admin();
  UPDATE task_submissions SET status='under_review' WHERE id=_submission AND status='submitted';
END $$;

-- Request withdrawal
CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric, _phone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); p profiles; st app_settings; bal numeric; wid uuid; ph text;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO p FROM profiles WHERE id=u FOR UPDATE;  -- serialises withdrawals per user
  IF p.status <> 'active' THEN RAISE EXCEPTION 'Your account is suspended'; END IF;
  IF NOT p.activated AND NOT has_role(u,'admin') THEN RAISE EXCEPTION 'Activate your account first'; END IF;
  SELECT * INTO st FROM app_settings WHERE id=1;
  IF NOT st.withdrawals_enabled THEN RAISE EXCEPTION 'Withdrawals are paused right now'; END IF;
  IF _amount IS NULL OR _amount <> round(_amount) OR _amount <= 0 THEN RAISE EXCEPTION 'Enter a whole amount in KES'; END IF;
  IF _amount < st.min_withdrawal THEN RAISE EXCEPTION 'Minimum withdrawal is KES %', st.min_withdrawal; END IF;
  ph := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF ph ~ '^0[17]\d{8}$' THEN ph := '254' || substr(ph,2); END IF;
  IF ph !~ '^254[17]\d{8}$' THEN RAISE EXCEPTION 'Enter a valid Safaricom number'; END IF;
  IF EXISTS (SELECT 1 FROM withdrawals WHERE user_id=u AND status IN ('pending','processing')) THEN
    RAISE EXCEPTION 'You already have a withdrawal in progress';
  END IF;
  bal := wallet_balance(u);
  IF bal < _amount + st.withdrawal_fee THEN RAISE EXCEPTION 'Insufficient balance (KES % available, KES % needed incl. fee)', bal, _amount + st.withdrawal_fee; END IF;
  INSERT INTO withdrawals (user_id, amount, fee, phone) VALUES (u, _amount, st.withdrawal_fee, ph) RETURNING id INTO wid;
  INSERT INTO ledger (user_id, type, amount, ref, note) VALUES (u, 'withdrawal', -(_amount + st.withdrawal_fee), wid::text, 'Withdrawal to M-Pesa ' || ph);
  RETURN wid;
END $$;

-- Admin: update withdrawal
CREATE OR REPLACE FUNCTION public.admin_update_withdrawal(_id uuid, _status text, _receipt text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w withdrawals; rc text;
BEGIN
  PERFORM require_admin();
  SELECT * INTO w FROM withdrawals WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF w.status IN ('paid','rejected') THEN RAISE EXCEPTION 'This withdrawal is already closed'; END IF;
  IF _status = 'processing' THEN
    UPDATE withdrawals SET status='processing', admin_note=_note, updated_at=now() WHERE id=_id;
  ELSIF _status = 'paid' THEN
    rc := upper(trim(coalesce(_receipt,'')));
    IF rc !~ '^[A-Z0-9]{8,12}$' THEN RAISE EXCEPTION 'Enter the M-Pesa receipt code from the confirmation SMS'; END IF;
    UPDATE withdrawals SET status='paid', mpesa_receipt=rc, admin_note=_note, updated_at=now() WHERE id=_id;
  ELSIF _status = 'rejected' THEN
    UPDATE withdrawals SET status='rejected', admin_note=_note, updated_at=now() WHERE id=_id;
    INSERT INTO ledger (user_id, type, amount, ref, note) VALUES (w.user_id, 'withdrawal_refund', w.amount + w.fee, w.id::text, 'Withdrawal rejected – refunded');
  ELSE
    RAISE EXCEPTION 'Invalid status';
  END IF;
  INSERT INTO audit_log (actor, action, detail) VALUES (auth.uid(), 'withdrawal_' || _status, _id::text);
END $$;

-- Admin: wallet adjustment
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(_user uuid, _amount numeric, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM require_admin();
  IF _amount = 0 OR abs(_amount) > 100000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF coalesce(trim(_note),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  PERFORM 1 FROM profiles WHERE id=_user FOR UPDATE;
  IF wallet_balance(_user) + _amount < 0 THEN RAISE EXCEPTION 'Balance cannot go below zero'; END IF;
  INSERT INTO ledger (user_id, type, amount, note) VALUES (_user, 'adjustment', _amount, left(_note,200));
  INSERT INTO audit_log (actor, action, detail) VALUES (auth.uid(), 'wallet_adjust', _user::text || ' ' || _amount::text || ' ' || left(_note,200));
END $$;

-- Activation (service role only, called after verified M-Pesa payment)
CREATE OR REPLACE FUNCTION public.activate_from_payment(_payment uuid, _receipt text, _paid_amount numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ap activation_payments; p profiles; st app_settings;
BEGIN
  SELECT * INTO ap FROM activation_payments WHERE id=_payment FOR UPDATE;
  IF NOT FOUND OR ap.status = 'paid' THEN RETURN false; END IF;
  IF _paid_amount < ap.amount THEN
    UPDATE activation_payments SET status='failed', result_description='Amount mismatch', updated_at=now() WHERE id=_payment;
    RETURN false;
  END IF;
  UPDATE activation_payments SET status='paid', mpesa_receipt=_receipt, paid_at=now(), updated_at=now(), result_description='Paid' WHERE id=_payment;
  SELECT * INTO p FROM profiles WHERE id=ap.user_id FOR UPDATE;
  IF p.activated THEN RETURN true; END IF;
  UPDATE profiles SET activated=true, activated_at=now() WHERE id=ap.user_id;
  SELECT * INTO st FROM app_settings WHERE id=1;
  IF p.referred_by IS NOT NULL AND st.referral_commission > 0 THEN
    INSERT INTO ledger (user_id, type, amount, ref, note)
      VALUES (p.referred_by, 'referral_reward', st.referral_commission, ap.user_id::text, 'Referral: ' || coalesce(nullif(p.full_name,''),'new member') || ' activated')
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.activate_from_payment(uuid,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_from_payment(uuid,text,numeric) TO service_role;

-- Admin: manually activate (e.g. verified offline payment)
CREATE OR REPLACE FUNCTION public.admin_set_activation(_user uuid, _activated boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM require_admin();
  UPDATE profiles SET activated=_activated, activated_at=CASE WHEN _activated THEN now() ELSE NULL END WHERE id=_user;
  INSERT INTO audit_log (actor, action, detail) VALUES (auth.uid(), CASE WHEN _activated THEN 'manual_activate' ELSE 'manual_deactivate' END, _user::text);
END $$;

-- Submit review (signed-in, rate limited)
CREATE OR REPLACE FUNCTION public.submit_review(_rating int, _body text, _consent boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); p profiles; is_verified boolean;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Sign in to leave a review'; END IF;
  IF NOT coalesce(_consent,false) THEN RAISE EXCEPTION 'Please allow us to publish your review'; END IF;
  IF EXISTS (SELECT 1 FROM reviews WHERE user_id=u AND created_at > now() - interval '7 days') THEN
    RAISE EXCEPTION 'You can leave one review per week';
  END IF;
  SELECT * INTO p FROM profiles WHERE id=u;
  is_verified := EXISTS (SELECT 1 FROM withdrawals WHERE user_id=u AND status='paid')
              OR EXISTS (SELECT 1 FROM task_submissions WHERE user_id=u AND status='approved');
  INSERT INTO reviews (user_id, display_name, rating, body, verified, publish_consent)
  VALUES (u, coalesce(nullif(split_part(trim(p.full_name),' ',1),''),'Member'), _rating, trim(_body), is_verified, true);
END $$;

-- Platform stats (public, aggregate only)
CREATE OR REPLACE FUNCTION public.platform_stats()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'members', (SELECT count(*) FROM profiles),
    'active_tasks', (SELECT count(*) FROM tasks WHERE active),
    'categories', (SELECT count(DISTINCT category) FROM tasks WHERE active),
    'tasks_completed', (SELECT count(*) FROM task_submissions WHERE status='approved'),
    'paid_out', COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status='paid'),0)
  )
$$;
GRANT EXECUTE ON FUNCTION public.platform_stats() TO anon, authenticated;

-- Admin stats
CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM require_admin();
  RETURN json_build_object(
    'users', (SELECT count(*) FROM profiles),
    'activated', (SELECT count(*) FROM profiles WHERE activated),
    'pending_submissions', (SELECT count(*) FROM task_submissions WHERE status IN ('submitted','under_review')),
    'pending_withdrawals', (SELECT count(*) FROM withdrawals WHERE status IN ('pending','processing')),
    'pending_withdrawals_amount', COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status IN ('pending','processing')),0),
    'paid_out', COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status='paid'),0),
    'activation_revenue', COALESCE((SELECT SUM(amount) FROM activation_payments WHERE status='paid'),0),
    'wallet_liability', COALESCE((SELECT SUM(amount) FROM ledger),0),
    'open_complaints', (SELECT count(*) FROM complaints WHERE status='open'),
    'pending_reviews', (SELECT count(*) FROM reviews WHERE status='pending')
  );
END $$;

-- Lock down execute grants for user-facing RPCs
REVOKE EXECUTE ON FUNCTION public.start_task(uuid), public.submit_task(uuid,text,text), public.request_withdrawal(numeric,text),
  public.my_wallet(), public.submit_review(int,text,boolean), public.admin_review_submission(uuid,boolean,text),
  public.admin_mark_under_review(uuid), public.admin_update_withdrawal(uuid,text,text,text), public.admin_adjust_wallet(uuid,numeric,text),
  public.admin_set_activation(uuid,boolean), public.admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_task(uuid), public.submit_task(uuid,text,text), public.request_withdrawal(numeric,text),
  public.my_wallet(), public.submit_review(int,text,boolean), public.admin_review_submission(uuid,boolean,text),
  public.admin_mark_under_review(uuid), public.admin_update_withdrawal(uuid,text,text,text), public.admin_adjust_wallet(uuid,numeric,text),
  public.admin_set_activation(uuid,boolean), public.admin_stats() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_balance(uuid) TO service_role;

-- ===== Seed tasks (rewards/durations left for the admin to set) =====
INSERT INTO public.tasks (category, title, description, instructions, requires_proof) VALUES
('tiktok','Watch & engage: TikTok clip','Watch a short TikTok video to the end and react to it.','1. Open the video link.\n2. Watch it to the end.\n3. Like the video.\n4. Paste your TikTok username below as proof.',true),
('youtube','Watch a YouTube video','Watch the listed YouTube video for the full length.','1. Open the video link.\n2. Watch the full video.\n3. Answer: what was the main topic? Write it below.',true),
('movies','Movie trailer review','Watch a movie trailer and write a short opinion.','1. Watch the trailer.\n2. Write 2–3 sentences on what you liked or disliked.',true),
('surveys','Consumer opinion survey','Answer a short survey about everyday shopping habits.','1. Open the survey link.\n2. Answer every question honestly.\n3. Paste the completion code shown at the end.',true),
('trivia','General knowledge trivia','Answer a set of general knowledge questions.','1. Open the quiz.\n2. Answer all questions.\n3. Upload a screenshot of your final score.',true),
('chatting','Customer chat assistant','Hold a short, polite chat conversation following the script provided.','1. Follow the chat script.\n2. Keep replies friendly and on topic.\n3. Upload a screenshot of the finished chat.',true),
('social','Follow & share on social media','Follow a partner page and share one post.','1. Follow the page at the link.\n2. Share the pinned post.\n3. Paste the link to your share.',true),
('games','Play a casual game level','Play a free casual game and finish the first level.','1. Open the game.\n2. Complete level 1.\n3. Upload a screenshot of the level-complete screen.',true),
('ads','View a partner advertisement','Watch a full partner advert and answer one question about it.','1. Watch the full advert.\n2. Write the brand name shown at the end.',true),
('spin','Daily spin reward','Claim your daily spin bonus. One spin per day.','Open the task and submit to claim today''s spin. Rewards are credited after review.',false),
('writing','Write a short article','Write a 300-word article on the topic provided.','1. Read the brief.\n2. Write at least 300 original words.\n3. Paste your article below.',true),
('promotion','Promote a product','Share a product promotion with your WhatsApp status or group.','1. Post the promo image/text on your status.\n2. Upload a screenshot after 1 hour showing views.',true),
('referral','Invite a friend who activates','Invite a friend using your referral link. Earn the referral commission when they activate.','Share your referral link from the Referrals page. This task is credited automatically when your friend activates.',false),
('general','General online assignment','Complete a simple online assignment such as data checking or tagging.','1. Read the assignment brief.\n2. Complete it carefully.\n3. Paste your answers or upload a file.',true);

-- ===== Sample reviews (clearly labelled samples; admin can delete) =====
INSERT INTO public.reviews (display_name, rating, body, status, is_sample) VALUES
('Sample',5,'Received my withdrawal yesterday through M-Pesa. The process was smooth.','approved',true),
('Sample',5,'I love how easy it is to find and complete tasks. The dashboard is also very simple.','approved',true),
('Sample',4,'My withdrawal was processed successfully. Good experience so far.','approved',true),
('Sample',5,'Tasks are easy to understand, and I can track my earnings from my dashboard.','approved',true);
