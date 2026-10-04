import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
export default defineConfig(({ command, mode }) => ({
  build: { outDir: command === "serve" ? "dist-dev" : mode === "e2e" ? "dist-e2e" : "dist", sourcemap: false },
  plugins: [
    react(),
    tailwindcss(),
    crx({
      manifest: {
        manifest_version: 3,
        name: "easyApply",
        short_name: "easyApply",
        icons: {
          16: "public/icons/icon-16.png",
          32: "public/icons/icon-32.png",
          48: "public/icons/icon-48.png",
          128: "public/icons/icon-128.png",
        },
        version: "1.0.0",
        description:
          "Review and autofill job applications with local profiles.",
        optional_host_permissions: ["https://api.groq.com/*"],
        ...(mode === "e2e" ? { host_permissions: ["http://127.0.0.1/*"] } : {}),
        permissions: ["storage", "activeTab", "scripting", "contextMenus"],
        commands: {
          "quick-fill": {
            suggested_key: { default: "Alt+Shift+F" },
            description: "Fill eligible empty fields with the selected profile",
          },
        },
        background: { service_worker: "src/background.ts", type: "module" },
        action: {
          default_popup: "index.html",
          default_title: "easyApply — Review & autofill",
          default_icon: {
            16: "public/icons/icon-16.png",
            32: "public/icons/icon-32.png",
            48: "public/icons/icon-48.png",
            128: "public/icons/icon-128.png",
          },
        },
        options_page: "settings.html",
      },
    }),
  ],
}));
