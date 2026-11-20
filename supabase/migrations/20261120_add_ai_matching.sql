-- Run once on an existing SAN3TY Supabase project after the original schema.sql.
-- SAN3TY Vision AI + verified artisan matching.
create or replace function public.discover_artisans(
 p_category_slug text, p_city text, p_area text, p_limit integer default 8
)
returns table (
 artisan_id uuid, full_name text, avatar_url text, bio text, years_experience integer,
 city text, service_area text, is_verified boolean, average_rating numeric,
 review_count bigint, completed_jobs integer
)
language sql stable security definer set search_path = ''
as $$
 select ap.user_id, coalesce(nullif(p.full_name,''),'مقدم خدمة SAN3TY')::text, p.avatar_url,
        ap.bio, ap.years_experience, ap.city, ap.service_area, ap.is_verified,
        coalesce(round(avg(r.rating)::numeric,2),ap.average_rating)::numeric,
        count(r.id)::bigint, ap.completed_jobs
 from public.artisan_profiles ap
 join public.profiles p on p.id=ap.user_id
 join public.artisan_services ars on ars.artisan_id=ap.user_id
 join public.service_categories sc on sc.id=ars.category_id
 left join public.reviews r on r.artisan_id=ap.user_id
 where sc.slug=p_category_slug and sc.is_active=true
   and ap.is_verified=true and ap.is_available=true
   and (nullif(trim(p_city),'') is null or lower(coalesce(ap.city,p.city,''))=lower(trim(p_city)))
   and (nullif(trim(p_area),'') is null or coalesce(ap.service_area,'') ilike '%'||trim(p_area)||'%')
 group by ap.user_id,p.full_name,p.avatar_url,ap.bio,ap.years_experience,ap.city,ap.service_area,ap.is_verified,ap.average_rating,ap.completed_jobs
 order by (count(r.id)>0) desc, avg(r.rating) desc nulls last, ap.average_rating desc, count(r.id) desc, ap.completed_jobs desc
 limit least(greatest(coalesce(p_limit,8),1),12);
$$;
revoke all on function public.discover_artisans(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.discover_artisans(text,text,text,integer) to service_role;

create table if not exists public.ai_request_limits (
 fingerprint_hash text primary key, window_started_at timestamptz not null default now(),
 request_count integer not null default 0 check (request_count>=0)
);
alter table public.ai_request_limits enable row level security;
revoke all on public.ai_request_limits from public,anon,authenticated;

create or replace function public.consume_ai_diagnosis_quota(p_fingerprint_hash text,p_limit integer default 12)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare current_count integer;
begin
 insert into public.ai_request_limits as current_usage(fingerprint_hash,window_started_at,request_count)
 values(p_fingerprint_hash,now(),1)
 on conflict(fingerprint_hash) do update
 set request_count=case when current_usage.window_started_at<now()-interval '1 hour' then 1 else current_usage.request_count+1 end,
     window_started_at=case when current_usage.window_started_at<now()-interval '1 hour' then now() else current_usage.window_started_at end
 returning request_count into current_count;
 return current_count<=least(greatest(coalesce(p_limit,12),1),30);
end;
$$;
revoke all on function public.consume_ai_diagnosis_quota(text,integer) from public,anon,authenticated;
grant execute on function public.consume_ai_diagnosis_quota(text,integer) to service_role;

