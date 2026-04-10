const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

// Linux: avoid blank renderer on some GPU/driver stacks (skip on Windows/macOS defaults).
if (process.platform === "linux") {
  app.disableHardwareAcceleration();
}

if (process.env.MAV_GUI_OZONE_X11 === "1" || process.env.AUV_GUI_OZONE_X11 === "1") {
  app.commandLine.appendSwitch("ozone-platform", "x11");
}

let mainWindow = null;
let backendProcess = null;

const BACKEND_PORT = Number(process.env.BACKEND_PORT || 8000);
const GUI_URL = `http://127.0.0.1:${BACKEND_PORT}`;

function backendPaths() {
  const isDev = !app.isPackaged;
  if (isDev) {
    return {
      cwd: path.join(__dirname, "../backend"),
      staticDir: path.join(__dirname, "../frontend/dist"),
      entry: path.join(__dirname, "../backend/dist/index.js"),
    };
  }
  const res = process.resourcesPath;
  return {
    cwd: path.join(res, "backend"),
    staticDir: path.join(res, "frontend-dist"),
    entry: path.join(res, "backend/dist/index.js"),
  };
}

function waitForHttp(url, timeoutMs, intervalMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryOnce = () => {
      const u = new URL(url);
      const reqPath = u.pathname && u.pathname !== "" ? u.pathname : "/";
      const req = http.request(
        { hostname: u.hostname, port: u.port, path: reqPath, method: "GET", timeout: 2000 },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Server did not respond at ${url} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(tryOnce, intervalMs);
      });
      req.on("timeout", () => {
        req.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Server did not respond at ${url} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(tryOnce, intervalMs);
      });
      req.end();
    };
    tryOnce();
  });
}

function startBackend() {
  const { cwd, staticDir, entry } = backendPaths();
  const fs = require("fs");
  if (!fs.existsSync(entry)) {
    console.error("Backend entry missing:", entry);
    return;
  }
  backendProcess = spawn(process.execPath, [entry], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      MAV_GUI_STATIC: staticDir,
      AUV_GUI_STATIC: staticDir,
      FRONTEND_ORIGIN: GUI_URL,
      BACKEND_PORT: String(BACKEND_PORT),
    },
    stdio: "inherit",
  });
  backendProcess.on("error", (e) => {
    console.error("backend spawn error", e);
  });
  backendProcess.on("exit", (code) => {
    console.log("backend exited", code);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Some Linux setups fail to paint the renderer with sandbox on.
      sandbox: false,
    },
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[gui] did-fail-load", { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on("console-message", (_event, level, message) => {
    if (process.env.MAV_GUI_DEBUG === "1" || process.env.AUV_GUI_DEBUG === "1") {
      console.log("[renderer]", message);
      return;
    }
    if (level >= 2) console.error("[renderer]", message);
  });

  if (process.env.MAV_GUI_DEBUG === "1" || process.env.AUV_GUI_DEBUG === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  waitForHttp(GUI_URL, 60000, 300)
    .then(() => mainWindow.loadURL(GUI_URL))
    .catch((err) => {
      console.error(err);
      mainWindow.loadURL("data:text/plain," + encodeURIComponent(String(err)));
    });
}

app.whenReady().then(() => {
  // Electron’s default File / Edit / View / … menu; hide so only the web UI shows.
  Menu.setApplicationMenu(null);
  startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill("SIGTERM");
  }
});
