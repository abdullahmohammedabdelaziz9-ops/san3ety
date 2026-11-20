-- SAN3TY starter schema for Supabase (PostgreSQL)
-- Run this in Supabase Dashboard -> SQL Editor on a NEW project.
-- This schema is a starting point. Review security and payment flows before production use.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  role text not null default 'customer' check (role in ('customer','artisan','admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique,
  slug text not null unique,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.artisan_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bio text,
  years_experience integer not null default 0 check (years_experience >= 0),
  city text,
  service_area text,
  is_verified boolean not null default false,
  is_available boolean not null default true,
  average_rating numeric(3,2) not null default 0 check (average_rating between 0 and 5),
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artisan_services (
  artisan_id uuid not null references public.artisan_profiles(user_id) on delete cascade,
  category_id uuid not null references public.service_categories(id) on delete restrict,
  primary key (artisan_id, category_id)
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid references public.service_categories(id) on delete set null,
  description text not null,
  city text not null,
  area text,
  preferred_time text,
  ai_summary text,
  estimated_min numeric(10,2),
  estimated_max numeric(10,2),
  status text not null default 'pending' check (status in ('pending','matching','booked','in_progress','completed','cancelled','disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estimated_min is null or estimated_min >= 0),
  check (estimated_max is null or estimated_max >= 0),
  check (estimated_min is null or estimated_max is null or estimated_max >= estimated_min)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  artisan_id uuid not null references public.artisan_profiles(user_id) on delete restrict,
  scheduled_at timestamptz,
  agreed_amount numeric(10,2) check (agreed_amount is null or agreed_amount >= 0),
  currency text not null default 'EGP',
  status text not null default 'awaiting_confirmation' check (status in ('awaiting_confirmation','confirmed','in_progress','completed','cancelled','disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_updates (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  artisan_id uuid not null references public.artisan_profiles(user_id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- Store only references/status from a real payment processor.
-- Never treat a row in this table as proof that money is held in escrow.
create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  provider text not null,
  provider_reference text unique,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'EGP',
  status text not null default 'created' check (status in ('created','authorized','captured','released','refunded','failed','disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_requests_customer on public.service_requests(customer_id, created_at desc);
create index if not exists idx_service_requests_status on public.service_requests(status, created_at desc);
create index if not exists idx_bookings_customer on public.bookings(customer_id, created_at desc);
create index if not exists idx_bookings_artisan on public.bookings(artisan_id, created_at desc);
create index if not exists idx_messages_booking on public.messages(booking_id, created_at);
create index if not exists idx_reviews_artisan on public.reviews(artisan_id, created_at desc);

-- Keep profile records in sync with Supabase Auth sign-ups.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','artisan_profiles','service_requests','bookings','payment_records'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', t);
  end loop;
end $$;

-- Starter categories
insert into public.service_categories (name_ar, slug, icon) values
  ('سباكة','plumbing','⌁'),
  ('كهرباء','electrical','ϟ'),
  ('نجارة','carpentry','⌂'),
  ('تكييف','air-conditioning','❋'),
  ('دهانات وتشطيبات','painting','◒'),
  ('تنظيف وصيانة','cleaning','✧')
on conflict (slug) do nothing;

-- Row Level Security: start private by default.
alter table public.profiles enable row level security;
alter table public.service_categories enable row level security;
alter table public.artisan_profiles enable row level security;
alter table public.artisan_services enable row level security;
alter table public.service_requests enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_updates enable row level security;
alter table public.reviews enable row level security;
alter table public.messages enable row level security;
alter table public.payment_records enable row level security;

-- Profiles: users can read/update only their own profile.
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Categories are public read-only data.
create policy "categories_read_active" on public.service_categories for select to anon, authenticated using (is_active = true);

-- Public can discover verified and available artisans; an artisan can see their own row.
create policy "artisan_profiles_discover" on public.artisan_profiles for select to anon, authenticated using (is_verified = true and is_available = true or user_id = (select auth.uid()));
create policy "artisan_profiles_update_own" on public.artisan_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "artisan_services_read" on public.artisan_services for select to anon, authenticated using (exists (select 1 from public.artisan_profiles ap where ap.user_id = artisan_id and ap.is_verified and ap.is_available));
create policy "artisan_services_manage_own" on public.artisan_services for all to authenticated using (artisan_id = (select auth.uid())) with check (artisan_id = (select auth.uid()));

-- A customer owns their requests. Provider assignment and status changes should be done by a trusted backend.
create policy "requests_read_own" on public.service_requests for select to authenticated using (customer_id = (select auth.uid()));
create policy "requests_create_own" on public.service_requests for insert to authenticated with check (customer_id = (select auth.uid()));
create policy "requests_update_own_pending" on public.service_requests for update to authenticated using (customer_id = (select auth.uid()) and status = 'pending') with check (customer_id = (select auth.uid()) and status in ('pending','cancelled'));

-- Booking participants can read a booking. Lifecycle updates should be handled by server-side logic.
create policy "bookings_read_participants" on public.bookings for select to authenticated using (customer_id = (select auth.uid()) or artisan_id = (select auth.uid()));
create policy "booking_updates_read_participants" on public.booking_updates for select to authenticated using (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = (select auth.uid()) or b.artisan_id = (select auth.uid()))));

-- Reviews can be read publicly; inserts must come through a trusted backend after a completed booking.
create policy "reviews_read_public" on public.reviews for select to anon, authenticated using (true);

-- Booking messages are visible only to participants. Message insertion should also validate membership server-side.
create policy "messages_read_participants" on public.messages for select to authenticated using (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = (select auth.uid()) or b.artisan_id = (select auth.uid()))));
create policy "messages_insert_as_participant" on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = (select auth.uid()) or b.artisan_id = (select auth.uid()))));

-- Payment rows are never writable by the browser client.
create policy "payments_read_booking_participants" on public.payment_records for select to authenticated using (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = (select auth.uid()) or b.artisan_id = (select auth.uid()))));

-- IMPORTANT:
-- 1) Do not expose the Supabase service_role key in browser code.
-- 2) Put matching, booking transitions, payment webhooks and review creation behind Edge Functions/server APIs.
-- 3) Implement strict validation, rate limits, audit logs and dispute handling before production.
-- 4) Escrow-like payment flows require a supported payment provider and legal/compliance review.

-- Least-privilege table and column grants for browser roles.
-- Row Level Security controls row access; SQL grants control writable operations and columns.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, city, avatar_url) on public.profiles to authenticated;

revoke all on public.service_categories from anon, authenticated;
grant select on public.service_categories to anon, authenticated;

revoke all on public.artisan_profiles from anon, authenticated;
grant select on public.artisan_profiles to anon, authenticated;
grant insert (user_id, bio, years_experience, city, service_area) on public.artisan_profiles to authenticated;
grant update (bio, years_experience, city, service_area, is_available) on public.artisan_profiles to authenticated;
create policy "artisan_profiles_insert_own" on public.artisan_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and is_verified = false);

revoke all on public.artisan_services from anon, authenticated;
grant select on public.artisan_services to anon, authenticated;
grant insert, delete on public.artisan_services to authenticated;

revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
grant insert (customer_id, category_id, description, city, area, preferred_time) on public.service_requests to authenticated;
grant update (category_id, description, city, area, preferred_time, status) on public.service_requests to authenticated;

revoke all on public.bookings from anon, authenticated;
grant select on public.bookings to authenticated;

revoke all on public.booking_updates from anon, authenticated;
grant select on public.booking_updates to authenticated;

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;

revoke all on public.payment_records from anon, authenticated;
grant select on public.payment_records to authenticated;

-- Profile roles, artisan verification, rating aggregates, booking lifecycle, reviews and payment status
-- must be changed only by trusted server-side functions or administrative operations.
