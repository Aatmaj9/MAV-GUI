# AUV Web GUI

Desktop and web-based interface for controlling and monitoring your AUV from your PC. 
**Onboard layout:** This GUI expects the same repository layout as the [AUV](https://github.com/Aatmaj9/AUV) software stack on the vehicle. Clone that repo on the AUV machine and keep the expected folder structure so paths and tooling match what the GUI assumes.

---

## Option A — Run from source (development)

Use this when you are developing or running the latest code from this repository.

### Requirements

- **Node.js** 18+ and **npm** (LTS recommended)
- Network path from your PC to the AUV computer (**SSH**)
- The **AUV** repository on the vehicle, arranged as that project documents

### Install

From the repository root:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Configuration

Edit the `backend/.env` and set the defaults for your configuration.

If you omit `backend/.env`, defaults from `backend/src/config.ts` are used.

| Variable | Description | Default |
|---|---|---|
| `JETSON_HOST` | AUV / Jetson hostname or IP | `192.168.1.162` |
| `JETSON_USER` | SSH username | `timi` |
| `JETSON_PORT` | SSH port | `22` |
| `JETSON_AUV_DIR` | Path to the AUV repo on the vehicle | `/home/timi/AUV` |
| `DOCKER_CONTAINER` | Docker container name used for ROS/sensors | `auv` |
| `JETSON_PASSWORD` | SSH password (if not using keys) | — |
| `JETSON_PRIVATE_KEY` | Path to SSH private key on the machine running the GUI | — |
| `SSH_AUTH_SOCK` | SSH auth socket override | — |
| `BACKEND_PORT` | HTTP API / WebSocket port | `8000` |
| `FRONTEND_ORIGIN` | Allowed browser origin (CORS) | `http://localhost:5173` |

You can also set connection details in the GUI **Connection** tab; those apply for the session and override `.env` defaults.

### Run

Use **two terminals** from the repository root:

```bash
# Terminal 1 — backend API
cd backend && npm run dev
```

```bash
# Terminal 2 — frontend (Vite)
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser. The dev server proxies API and WebSocket traffic to the backend (default port **8000**).

---

## Option B — Install the desktop app (releases)

Use this when you want a packaged app without installing Node or cloning the repository for daily use.

1. Open the **[Releases](https://github.com/Aatmaj9/AUV-GUI/releases)** page for this repository.
2. Download the artifact for your system:
   - **Linux:** `.AppImage` — make it executable (`chmod +x *.AppImage`), then run it.
   - **Windows:** run the installer (`.exe`) and start **AUV Web GUI** from the Start menu or desktop shortcut.

Requirements are the same in practice: SSH reachability to the AUV and the onboard **AUV** repo layout on the vehicle. Install a newer release when you need fixes or features shipped after your current build.

---

