import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migration = await readFile(
  resolve(
    process.cwd(),
    "supabase/migrations/20261016000100_community_core.sql",
  ),
  "utf8",
);

describe("community core migration", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await database.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await database.exec(migration);
  });

  afterEach(async () => {
    await database.close();
  });

  it("applies and creates all six supported listing categories", async () => {
    const result = await database.query<{ category: string }>(`
      select unnest(array[
        'donation', 'event', 'job', 'free_item', 'service', 'mutual_aid'
      ]) as category
    `);

    expect(result.rows.map((row) => row.category)).toEqual([
      "donation",
      "event",
      "job",
      "free_item",
      "service",
      "mutual_aid",
    ]);
    const tables = await database.query<{ tablename: string }>(`
      select tablename
      from pg_tables
      where schemaname = 'public'
    `);
    expect(tables.rows.map((row) => row.tablename).sort()).toEqual([
      "communities",
      "community_memberships",
      "listing_images",
      "listings",
      "profiles",
      "task_completion_outbox",
      "tasks",
    ]);
  });

  it("enforces category, membership, image, and outbox constraints", async () => {
    await database.exec(`
      insert into auth.users (id) values
        ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002');
      insert into public.communities (id, slug, city)
        values ('00000000-0000-0000-0000-000000000010', 'river-town', 'River Town');
      insert into public.community_memberships (community_id, user_id)
        values (
          '00000000-0000-0000-0000-000000000010',
          '00000000-0000-0000-0000-000000000001'
        );
      insert into public.listings (
        id, community_id, owner_id, category, title, description
      ) values (
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000001',
        'free_item', 'Garden tools', 'Tools available for neighbors.'
      );
      insert into public.tasks (
        id, community_id, title, description, status, claimed_by,
        claimed_at, evidence, submitted_at
      ) values (
        '00000000-0000-0000-0000-000000000030',
        '00000000-0000-0000-0000-000000000010',
        'Review listings', 'Review a flagged listing.', 'submitted',
        '00000000-0000-0000-0000-000000000001',
        now(), '{"note":"reviewed"}', now()
      );
    `);

    await expectSqlFailure(() =>
      database.exec(`
        insert into public.listings (
          community_id, owner_id, category, title, description
        ) values (
          '00000000-0000-0000-0000-000000000010',
          '00000000-0000-0000-0000-000000000001',
          'unsupported', 'Bad category', 'Invalid category.'
        )
      `),
    );
    await expectSqlFailure(() =>
      database.exec(`
        insert into public.community_memberships (community_id, user_id)
        values (
          '00000000-0000-0000-0000-000000000010',
          '00000000-0000-0000-0000-000000000001'
        )
      `),
    );
    await expectSqlFailure(() =>
      database.exec(`
        insert into public.task_completion_outbox (
          task_id, source_event_id, event_type, payload
        ) values (
          '00000000-0000-0000-0000-000000000030',
          'task:30:completed',
          'task.completed',
          '{}'
        );
        insert into public.task_completion_outbox (
          task_id, source_event_id, event_type, payload
        ) values (
          '00000000-0000-0000-0000-000000000030',
          'task:30:completed:duplicate',
          'task.completed',
          '{}'
        )
      `),
    );
  });

  it("adds full-text, community-scope, and outbox retry indexes", async () => {
    const indexes = await database.query<{ indexname: string }>(`
      select indexname
      from pg_indexes
      where schemaname = 'public'
    `);
    const names = indexes.rows.map((row) => row.indexname);

    expect(names).toContain("listings_search_idx");
    expect(names).toContain("listings_community_category_status_created_idx");
    expect(names).toContain("task_completion_outbox_pending_idx");
  });

  it("enables row-level security on every application table", async () => {
    const result = await database.query<{ relname: string; relrowsecurity: boolean }>(`
      select relation.relname, relation.relrowsecurity
      from pg_class relation
      join pg_namespace schema on schema.oid = relation.relnamespace
      where schema.nspname = 'public'
        and relation.relkind = 'r'
    `);

    expect(result.rows).toHaveLength(7);
    expect(result.rows.every((row) => row.relrowsecurity)).toBe(true);
  });
});

async function expectSqlFailure(action: () => Promise<unknown>) {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}
