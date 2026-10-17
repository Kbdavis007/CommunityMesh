/// <reference types="@cloudflare/workers-types" />

interface Env extends Cloudflare.Env {
  GITHUB_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}
