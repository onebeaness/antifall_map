-- 안심걸음 Supabase 스키마 (준비본 — 아직 미연결)
--
-- 현재 앱은 localStorage(프론트 src/lib/storage.ts의 LocalStorageStorage)로 동작한다.
-- Supabase 전환 시:
--   1) 이 파일을 Supabase SQL Editor 또는 `supabase db push`로 적용
--   2) Supabase Auth 활성화 (이메일 OTP 또는 카카오 등)
--   3) 프론트에 @supabase/supabase-js 추가, storage.ts의 SupabaseStorage 구현
--
-- 설계 원칙: 등록 폼(이름·생년월일·성별·낙상경험) → profiles,
--            진단 1회 = assessments 1행 (간단/정밀 구분, 응답 원본 + ML 결과 보존).

-- ── 프로필 ───────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  birth date not null,
  gender text not null check (gender in ('M', 'F')),
  -- 최근 1년 낙상 경험 — ML Model B(재발위험) 게이트, 모든 진단 호출에 사용
  fall_experience boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 진단 기록 ────────────────────────────────────────────────────────
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('simple', 'precision')),
  -- 설문 응답 원본 (문항 코드 → 값, ML 재계산·이력 분석용)
  answers jsonb not null,
  -- 백엔드 /api/assess/* 응답 (prob_a, pct_a, label_a, contributors, pct_b ...)
  result jsonb,
  -- 조회 최적화용 발췌 컬럼
  pct_a smallint,
  label_a text,
  pct_b smallint,
  label_b text,
  created_at timestamptz not null default now()
);

create index if not exists assessments_user_kind_idx
  on public.assessments (user_id, kind, created_at desc);

-- ── RLS: 본인 데이터만 읽기/쓰기 ─────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.assessments enable row level security;

create policy "profiles: own read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: own insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: own update" on public.profiles
  for update using (auth.uid() = id);

create policy "assessments: own read" on public.assessments
  for select using (auth.uid() = user_id);
create policy "assessments: own insert" on public.assessments
  for insert with check (auth.uid() = user_id);
create policy "assessments: own delete" on public.assessments
  for delete using (auth.uid() = user_id);

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
