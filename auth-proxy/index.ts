import { Entry } from "@napi-rs/keyring";
import * as readline from "readline";

function log(msg: string, logger: typeof console.log = console.log) {
  logger(`[${new Date().toISOString()}] ${msg}`);
}

async function getApiKey(name: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = `Enter API key for ${name}: `;

  // Create a promise to handle the async nature of readline
  const result = new Promise<string>((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      console.log("\n"); // Move to a new line after entry
      resolve(answer);
    });
  });

  // @ts-ignore - Mute output to mask password
  rl._writeToOutput = function _writeToOutput(stringToWrite: string) {
    // Only mask if the string is not the prompt itself or a newline
    if (
      stringToWrite !== prompt &&
      stringToWrite !== "\n" &&
      stringToWrite !== "\r\n"
    ) {
      // @ts-expect-error we know we can write to output
      rl.output.write("*");
    } else {
      // @ts-expect-error we know we can write to output
      rl.output.write(stringToWrite);
    }
  };

  return result;
}

// Route configuration type
interface RouteConfig {
  path: string;
  host: string;
  service: string;
  account: string;
  headers?: Record<string, string>;
}

// Service definition with keys and optional headers
interface ServiceConfig {
  host: string;
  keys: string[];
  headers?: Record<string, string>;
}

// Root TOML config type
interface Config {
  keyring_service_name: string;
  port?: number;
  services: Record<string, ServiceConfig>;
}

// Load routes from TOML file
const config = Bun.TOML.parse(await Bun.file("./config.toml").text()) as Config;

const KEYRING_SERVICE = config.keyring_service_name;
const PORT = config.port || 3000;

// Flatten service config into individual routes
const ROUTES: RouteConfig[] = [];

for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
  const { host, keys, headers } = serviceConfig;

  // For each key, create a route with path /<service>/<key>/
  for (const key of keys) {
    const route = {
      path: `/${serviceName}/${key}/`,
      host,
      service: KEYRING_SERVICE,
      account: `${serviceName}:${key}`,
      headers,
    };

    ROUTES.push(route);
    const entry = new Entry(route.service, route.account);
    if (!entry.getPassword()) {
      entry.setPassword(await getApiKey(route.account));
    }
  }
}

// Find matching route based on pathname prefix
function getRouteConfig(pathname: string): RouteConfig | null {
  for (const route of ROUTES) {
    if (pathname.startsWith(route.path)) {
      return route;
    }
  }
  return null;
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    try {
      const url = new URL(request.url);
      log(`[${new Date()}] Processing: ${request.url}`);

      // Find route for this path
      const route = getRouteConfig(url.pathname);
      if (!route) {
        console.debug(`[${new Date()}]: Route not found!`);
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get credentials for this route
      const entry = new Entry(route.service, route.account);

      // Strip the prefix from path: /<service>/<key>/api/v1/... -> /api/v1/...
      const newPath = url.pathname.slice(route.path.length - 1); // Keep leading slash
      const targetUrl = `https://${route.host}${newPath}${url.search}`;

      // Get the secret/password for header replacement
      const secret = entry.getPassword() ?? "";

      // Clone and modify headers
      const headers = new Headers(request.headers);

      // Apply custom headers from service config, replacing $SECRET with the actual secret
      if (route.headers) {
        for (const [headerName, headerValue] of Object.entries(route.headers)) {
          headers.set(headerName, headerValue.replace(/\$SECRET/g, secret));
        }
      } else {
        headers.set("Authorization", `Bearer ${secret}`);
      }

      // Remove hop-by-hop headers
      headers.delete("host");
      headers.delete("connection");
      headers.delete("keep-alive");
      headers.delete("proxy-authenticate");
      headers.delete("proxy-authorization");
      headers.delete("te");
      headers.delete("trailers");
      headers.delete("transfer-encoding");
      headers.delete("upgrade");

      log(`Sending request to ${targetUrl}`);
      // Forward request
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body:
          request.method !== "GET" && request.method !== "HEAD"
            ? await request.blob()
            : undefined,
      });
      log(`Got response: ${JSON.stringify(response)}`);

      // Remove compression headers since fetch() already decompressed the body
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("content-length");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      log(`Proxy error: ${JSON.stringify(error, null, 2)}`, console.error);
      return new Response(
        JSON.stringify({ error: "Proxy error", message: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
});

log(`Reverse proxy running on http://localhost:${PORT}`);
log(
  "Loaded routes: " +
    ROUTES.map((r) => `${r.path} → ${r.host} (${r.account})`).join(", "),
);
