alter table public.communities
  add column revision bigint not null default 1 check (revision > 0),
  add column updated_at timestamptz not null default now();

alter table public.profiles
  add column revision bigint not null default 1 check (revision > 0);

alter table public.community_memberships
  add column revision bigint not null default 1 check (revision > 0),
  add column updated_at timestamptz not null default now();

alter table public.listings
  add column revision bigint not null default 1 check (revision > 0);

alter table public.listing_images
  add column community_id uuid,
  add column revision bigint not null default 1 check (revision > 0),
  add column updated_at timestamptz not null default now();

update public.listing_images image
set community_id = listing.community_id
from public.listings listing
where listing.id = image.listing_id;

alter table public.listings
  add constraint listings_id_community_unique unique (id, community_id);

alter table public.listing_images
  alter column community_id set not null,
  add constraint listing_images_community_fk
    foreign key (listing_id, community_id)
    references public.listings (id, community_id)
    on delete cascade;

alter table public.tasks
  add column revision bigint not null default 1 check (revision > 0);

create table public.sync_change_counters (
  scope_kind text not null check (scope_kind in ('community', 'account')),
  scope_id text not null check (length(trim(scope_id)) > 0),
  last_cursor bigint not null default 0 check (last_cursor >= 0),
  primary key (scope_kind, scope_id)
);

create table public.sync_change_feed (
  scope_kind text not null,
  scope_id text not null,
  cursor bigint not null check (cursor > 0),
  entity_type text not null check (length(trim(entity_type)) > 0),
  entity_id text not null check (length(trim(entity_id)) > 0),
  revision bigint not null check (revision > 0),
  change_type text not null check (change_type in ('upsert', 'delete')),
  changed_at timestamptz not null default now(),
  primary key (scope_kind, scope_id, cursor),
  unique (scope_kind, scope_id, entity_type, entity_id, revision),
  foreign key (scope_kind, scope_id)
    references public.sync_change_counters (scope_kind, scope_id)
);

create index sync_change_feed_entity_idx
  on public.sync_change_feed (scope_kind, scope_id, entity_type, entity_id, revision);

alter table public.sync_change_counters enable row level security;
alter table public.sync_change_feed enable row level security;
revoke all on public.sync_change_counters, public.sync_change_feed
  from public, anon, authenticated;
grant select on public.sync_change_feed to service_role;

create function public.set_listing_image_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_community uuid;
begin
  select listing.community_id into parent_community
  from public.listings listing
  where listing.id = new.listing_id;

  if parent_community is null then
    raise exception 'listing image must reference an existing listing';
  end if;

  new.community_id := parent_community;
  return new;
end;
$$;

create trigger listing_images_set_community
before insert or update of listing_id, community_id on public.listing_images
for each row execute function public.set_listing_image_community();

create function public.advance_sync_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function public.record_sync_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row jsonb;
  row_revision bigint;
  scope_kind text := tg_argv[1];
  scope_id text;
  entity_id text;
  change_cursor bigint;
  change_type text;
begin
  if tg_op = 'DELETE' then
    source_row := to_jsonb(old);
    row_revision := (source_row ->> 'revision')::bigint + 1;
    change_type := 'delete';
  else
    source_row := to_jsonb(new);
    row_revision := (source_row ->> 'revision')::bigint;
    change_type := 'upsert';
  end if;

  scope_id := source_row ->> tg_argv[2];
  entity_id := source_row ->> tg_argv[3];
  if tg_nargs > 4 and tg_argv[4] <> '' then
    entity_id := entity_id || ':' || (source_row ->> tg_argv[4]);
  end if;

  insert into public.sync_change_counters (scope_kind, scope_id, last_cursor)
  values (scope_kind, scope_id, 1)
  on conflict (scope_kind, scope_id) do update
    set last_cursor = public.sync_change_counters.last_cursor + 1
  returning last_cursor into change_cursor;

  insert into public.sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id,
    revision, change_type
  ) values (
    scope_kind, scope_id, change_cursor, tg_argv[0], entity_id,
    row_revision, change_type
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger communities_advance_sync_revision
before insert or update on public.communities
for each row execute function public.advance_sync_revision();
create trigger profiles_advance_sync_revision
before insert or update on public.profiles
for each row execute function public.advance_sync_revision();
create trigger memberships_advance_sync_revision
before insert or update on public.community_memberships
for each row execute function public.advance_sync_revision();
create trigger listings_advance_sync_revision
before insert or update on public.listings
for each row execute function public.advance_sync_revision();
create trigger listing_images_advance_sync_revision
before insert or update on public.listing_images
for each row execute function public.advance_sync_revision();
create trigger tasks_advance_sync_revision
before insert or update on public.tasks
for each row execute function public.advance_sync_revision();

create trigger communities_record_sync_change
after insert or update or delete on public.communities
for each row execute function public.record_sync_change(
  'community', 'community', 'id', 'id'
);
create trigger profiles_record_sync_change
after insert or update or delete on public.profiles
for each row execute function public.record_sync_change(
  'profile', 'account', 'id', 'id'
);
create trigger memberships_record_sync_change
after insert or update or delete on public.community_memberships
for each row execute function public.record_sync_change(
  'membership', 'account', 'user_id', 'community_id'
);
create trigger listings_record_sync_change
after insert or update or delete on public.listings
for each row execute function public.record_sync_change(
  'listing', 'community', 'community_id', 'id'
);
create trigger listing_images_record_sync_change
after insert or update or delete on public.listing_images
for each row execute function public.record_sync_change(
  'listing_image', 'community', 'community_id', 'id'
);
create trigger tasks_record_sync_change
after insert or update or delete on public.tasks
for each row execute function public.record_sync_change(
  'task', 'community', 'community_id', 'id'
);
