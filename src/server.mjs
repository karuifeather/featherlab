import http from "node:http";
import { createApp } from "./app.mjs";
import { hostAllowed, originAllowed, reply, toErrorResponse } from "./api/http.mjs";
import { buildRoutes, matchRoute } from "./api/routes.mjs";
import { DEFAULT_CLUSTER } from "./infrastructure/environment.mjs";
import { staticFile } from "./api/static.mjs";
import { attachTerminal } from "./api/terminal.mjs";
import { checkForUpdate } from "./lib/update-check.mjs";

/**
 * HTTP bootstrap: Host/Origin checks, routing, static files and the terminal socket.
 * Binds to loopback only. Business logic lives in the application service.
 */
export async function startServer(
  port = 4317,
  {
    service = createApp().service,
    knowledgeCheckService,
    workstation,
    cluster = DEFAULT_CLUSTER,
    docker,
    version,
    stateDir,
  } = {},
) {
  const getVersionInfo =
    version && stateDir
      ? async () => {
          const info = await checkForUpdate(stateDir, version).catch(() => null);
          return {
            current: version,
            latest: info?.latest ?? version,
            isOutdated: info?.isOutdated ?? false,
          };
        }
      : null;

  const listening = { port: Number(port) };
  const routes = buildRoutes();
  const server = http.createServer(async (req, res) => {
    try {
      if (!hostAllowed(req, listening.port))
        return reply(res, 403, { error: "Forbidden host", code: "FORBIDDEN_HOST" });
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && !originAllowed(req, listening.port))
          return reply(res, 403, { error: "Forbidden origin", code: "FORBIDDEN_ORIGIN" });
        const { route, match } = matchRoute(routes, req.method, url.pathname);
        const { status = 200, body } = await route.handler(match, {
          service,
          knowledgeCheckService,
          url,
          req,
          cluster,
          getVersionInfo,
        });
        return reply(res, status, body);
      }
      if (req.method === "GET") return await staticFile(req, res);
      reply(res, 405, { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      reply(res, status, body);
    }
  });
  const { closeSessions } = attachTerminal(server, {
    getPort: () => listening.port,
    workstation,
    docker,
  });
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(listening.port, "127.0.0.1", resolve),
  );
  listening.port = server.address().port;
  return {
    port: listening.port,
    close: () => new Promise((resolve) => server.close(resolve)),
    closeSessions,
  };
}
