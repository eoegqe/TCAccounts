const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
          "vary": "Origin"
        }
      });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      try {
        const result = await env.TC.prepare("SELECT 1 AS ok").first();
        return json({
          service: "TCAccounts API",
          status: result?.ok === 1 ? "ok" : "database_unavailable",
          environment: env.APP_ENV || "unknown"
        }, result?.ok === 1 ? 200 : 503);
      } catch {
        return json({
          service: "TCAccounts API",
          status: "database_unavailable"
        }, 503);
      }
    }

    return json({ error: "not_found" }, 404);
  }
};
