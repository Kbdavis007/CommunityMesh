create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(trim(slug)) > 0),
  city text,
  region text,
  postal_code text,
  created_at timestamptz not null default now(),
  check (city is not null or postal_code is not null)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  bio text not null default '' check (length(bio) <= 2000),
  visibility text not null default 'community'
    check (visibility in ('public', 'community', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_memberships (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'left')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete restrict,
  category text not null check (
    category in ('donation', 'event', 'job', 'free_item', 'service', 'mutual_aid')
  ),
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null check (length(trim(description)) between 1 and 10000),
  status text not null default 'active'
    check (status in ('active', 'held', 'archived')),
  held_at timestamptz,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  object_key text not null unique check (length(trim(object_key)) > 0),
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  size_bytes bigint not null check (size_bytes > 0),
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null check (length(trim(description)) between 1 and 5000),
  status text not null default 'open'
    check (status in ('open', 'claimed', 'submitted', 'completed', 'cancelled')),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  evidence jsonb,
  submitted_at timestamptz,
  reviewer_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open' and claimed_by is null) or status <> 'open'),
  check ((status = 'submitted') = (submitted_at is not null)),
  check ((status = 'completed') = (reviewed_at is not null))
);

create table public.task_completion_outbox (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete restrict,
  source_event_id text not null unique check (length(trim(source_event_id)) > 0),
  event_type text not null check (event_type = 'task.completed'),
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (task_id, event_type),
  check ((status = 'delivered') = (delivered_at is not null))
);

create index listings_community_category_status_created_idx
  on public.listings (community_id, category, status, created_at desc);
create index listings_search_idx
  on public.listings
  using gin (to_tsvector('english', title || ' ' || description));
create index listings_owner_created_idx
  on public.listings (owner_id, created_at desc);
create index listing_images_listing_position_idx
  on public.listing_images (listing_id, position);
create index tasks_community_status_created_idx
  on public.tasks (community_id, status, created_at);
create index tasks_claimed_by_status_idx
  on public.tasks (claimed_by, status);
create index task_completion_outbox_pending_idx
  on public.task_completion_outbox (next_attempt_at, created_at)
  where status = 'pending';

create function public.is_active_community_member(target_community uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_memberships membership
    where membership.community_id = target_community
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create function public.is_community_admin(target_community uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_memberships membership
    where membership.community_id = target_community
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = 'admin'
  );
$$;

create function public.has_shared_active_community(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_memberships profile_membership
    join public.community_memberships viewer_membership
      on viewer_membership.community_id = profile_membership.community_id
    where profile_membership.user_id = target_user
      and profile_membership.status = 'active'
      and viewer_membership.user_id = (select auth.uid())
      and viewer_membership.status = 'active'
  );
$$;

revoke all on function public.is_active_community_member(uuid) from public;
revoke all on function public.is_community_admin(uuid) from public;
revoke all on function public.has_shared_active_community(uuid) from public;
grant execute on function public.is_active_community_member(uuid) to anon, authenticated;
grant execute on function public.is_community_admin(uuid) to anon, authenticated;
grant execute on function public.has_shared_active_community(uuid) to anon, authenticated;

alter table public.communities enable row level security;
alter table public.profiles enable row level security;
alter table public.community_memberships enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completion_outbox enable row level security;

create policy communities_read
  on public.communities for select
  using (true);

create policy profiles_read
  on public.profiles for select
  using (
    visibility = 'public'
    or id = (select auth.uid())
    or (visibility = 'community' and public.has_shared_active_community(id))
  );
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy memberships_read_self_or_admin
  on public.community_memberships for select
  using (
    user_id = (select auth.uid())
    or public.is_community_admin(community_id)
  );
create policy memberships_admin_insert
  on public.community_memberships for insert
  to authenticated
  with check (public.is_community_admin(community_id));
create policy memberships_admin_update
  on public.community_memberships for update
  to authenticated
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

create policy listings_read_active_or_owner_or_admin
  on public.listings for select
  using (
    status = 'active'
    or owner_id = (select auth.uid())
    or public.is_community_admin(community_id)
  );
create policy listings_insert_member
  on public.listings for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_community_member(community_id)
  );
create policy listings_update_owner
  on public.listings for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and status <> 'held'
    and public.is_active_community_member(community_id)
  )
  with check (
    owner_id = (select auth.uid())
    and status in ('active', 'archived')
    and public.is_active_community_member(community_id)
  );
create policy listings_update_admin
  on public.listings for update
  to authenticated
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

create policy listing_images_read_visible_listing
  on public.listing_images for select
  using (
    exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and (
          listing.status = 'active'
          or listing.owner_id = (select auth.uid())
          or public.is_community_admin(listing.community_id)
        )
    )
  );
create policy listing_images_insert_owner_or_admin
  on public.listing_images for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and (
          listing.owner_id = (select auth.uid())
          or public.is_community_admin(listing.community_id)
        )
    )
  );
create policy listing_images_update_owner_or_admin
  on public.listing_images for update
  to authenticated
  using (
    exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and (
          listing.owner_id = (select auth.uid())
          or public.is_community_admin(listing.community_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and (
          listing.owner_id = (select auth.uid())
          or public.is_community_admin(listing.community_id)
        )
    )
  );
create policy listing_images_delete_owner_or_admin
  on public.listing_images for delete
  to authenticated
  using (
    exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and (
          listing.owner_id = (select auth.uid())
          or public.is_community_admin(listing.community_id)
        )
    )
  );

create policy tasks_read_community_or_assignee
  on public.tasks for select
  using (
    public.is_active_community_member(community_id)
    or claimed_by = (select auth.uid())
  );

grant usage on schema public to anon, authenticated;
grant select on public.communities, public.profiles, public.listings,
  public.listing_images, public.tasks to anon, authenticated;
grant select on public.community_memberships to authenticated;
grant insert, update on public.profiles, public.community_memberships,
  public.listings, public.listing_images to authenticated;
