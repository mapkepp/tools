// Supabase Deno Edge Function. External authorization is validated via Yandex OAuth.
// verify_jwt=false is necessary because callers do not have a Supabase account.
import handler from "./handler.js";
Deno.serve((request) => handler.fetch(request));
