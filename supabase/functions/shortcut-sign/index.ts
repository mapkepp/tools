// Signing has no Supabase account login; validation restricts to the site's Origin.
import handler from "./handler.js";
Deno.serve((request)=>handler.fetch(request));
