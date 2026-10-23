import handler from "./handler.js";
Deno.serve((request)=>handler.fetch(request));
