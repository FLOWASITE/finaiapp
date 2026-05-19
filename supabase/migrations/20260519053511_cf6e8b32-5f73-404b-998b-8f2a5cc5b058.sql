create table if not exists public.ai_model_config (
  id smallint primary key default 1,
  enabled boolean not null default false,
  provider_label text not null default 'Custom OpenAI-compatible',
  base_url text not null default 'https://api.openai.com/v1',
  api_key_encrypted text,
  model_default text not null default 'gpt-4o-mini',
  model_chat text,
  model_parse text,
  model_reasoning text,
  extra_headers jsonb not null default '{}'::jsonb,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint ai_model_config_singleton check (id = 1)
);

insert into public.ai_model_config (id) values (1)
on conflict (id) do nothing;

alter table public.ai_model_config enable row level security;

drop policy if exists "superadmin can read ai_model_config" on public.ai_model_config;
create policy "superadmin can read ai_model_config"
  on public.ai_model_config for select
  to authenticated
  using (public.has_role(auth.uid(), 'superadmin'));

drop policy if exists "superadmin can update ai_model_config" on public.ai_model_config;
create policy "superadmin can update ai_model_config"
  on public.ai_model_config for update
  to authenticated
  using (public.has_role(auth.uid(), 'superadmin'))
  with check (public.has_role(auth.uid(), 'superadmin'));

create trigger ai_model_config_set_updated_at
  before update on public.ai_model_config
  for each row execute function public.set_updated_at();