import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, ".", "");
    var backend = env.VITE_BACKEND_PROXY_TARGET || "http://127.0.0.1:8000";
    return {
        plugins: [react()],
        server: {
            port: 5173,
            proxy: {
                "/api": backend,
                "/health": backend,
            },
        },
    };
});
