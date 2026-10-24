import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleEmergencyCall } from "./api/emergency-call.ts";

/**
 * The dev server answers /api/emergency-call the way Vercel does, so the tracker's emergency
 * call also works from `npm run dev` (and the phone test link). The Twilio settings are read
 * from .env.local on every request.
 */
function emergencyCallApi(): Plugin {
  return {
    name: "emergency-call-api",
    configureServer(server) {
      server.middlewares.use("/api/emergency-call", (request, res) => {
        // The bits of Node's request used here (the project has no Node types installed).
        const req = request as unknown as {
          method?: string;
          url?: string;
          headers: Record<string, string | string[] | undefined>;
          on(event: "data", listener: (chunk: unknown) => void): void;
          on(event: "end", listener: () => void): void;
        };
        let raw = "";
        req.on("data", (chunk) => (raw += String(chunk)));
        req.on("end", () => {
          let body: unknown = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            // not JSON (Twilio asking for the words sends a form): fine
          }
          const env = loadEnv(server.config.mode, server.config.root, "");
          void handleEmergencyCall({ method: req.method ?? "GET", url: req.url, headers: req.headers, body }, env).then((r) => {
            res.statusCode = r.status;
            res.setHeader("Content-Type", r.xml !== undefined ? "text/xml" : "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(r.xml ?? JSON.stringify(r.body));
          });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), emergencyCallApi()],
});
