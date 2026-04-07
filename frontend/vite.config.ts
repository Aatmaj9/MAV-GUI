import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * roslib's browser entry does `var ROSLIB = this.ROSLIB || {...}`. In bundled ESM,
 * top-level `this` is undefined, so production/Electron crashes with:
 * "Cannot read properties of undefined (reading 'ROSLIB')".
 */
const roslibGlobalThisFix: Plugin = {
  name: "roslib-globalthis-fix",
  transform(code, id) {
    if (!id.includes("roslib") || !id.endsWith("RosLib.js")) return null;
    if (!code.includes("var ROSLIB = this.ROSLIB ||")) return null;
    return code.replace(
      "var ROSLIB = this.ROSLIB ||",
      'var ROSLIB = (typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {}).ROSLIB ||'
    );
  },
};

export default defineConfig({
  plugins: [react(), roslibGlobalThisFix],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": {
        target: "ws://localhost:8000",
        ws: true
      }
    }
  }
});

