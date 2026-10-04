import { defineConfig } from "vite";
export default defineConfig({
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client"] },
  server: {
    host: "127.0.0.1",
    port: 4174,
    watch: {
      // Browser fixtures and build copies must not trigger reloads of the test page.
      ignored: [
        "**/.test-browser-profiles/**", "**/.browser/**", "**/.browser134/**",
        "**/test-results/**", "**/playwright-results/**", "**/dist/**",
        "**/dist-dev/**", "**/release/**",
      ],
    },
  },
});
