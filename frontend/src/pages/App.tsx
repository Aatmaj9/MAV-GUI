import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppBar,
  Autocomplete,
  Box,
  Button,
  Divider,
  Paper,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Typography,
  Chip,
  Alert,
  Link,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
// roslib has no bundled TS types in this setup
import ROSLIB from "roslib";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { extractNumericSeries } from "../ros/plotExtract";
import { TerminalSplitPane } from "../components/TerminalSplitPane";
import { Landing } from "./Landing";
import type { VesselKey, VesselProfile } from "../components/VesselConnectCard";

type ConnectedVehicle = {
  id: string;
  vessel: VesselKey;
  targetId: string;
  profile: VesselProfile;
  label: string;
  connectedAtMs: number;
};

type DashboardTab = {
  targetId: string;
  label: string;
  host: string;
};

const UDEV_APPLIED_SESSION_KEY = "mav-gui-udev-applied";

type TopicsResponse =
  | { code: number; topics: string[]; stderr?: string }
  | { code: number; stdout: string; stderr: string };

type NodesResponse =
  | { code: number; nodes: string[]; stderr?: string }
  | { code: number; stdout: string; stderr: string };

type UsbDevicesResponse =
  | { code: number; devices: string[]; stderr?: string }
  | { code: number; stdout: string; stderr: string };

function useBackendBaseWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  // Firefox can fail ws://localhost:8000 while HTTP works; use IPv4 loopback for WS only.
  const host =
    window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname;
  return `${proto}://${host}:8000`;
}

function useBackendBaseHttpUrl(): string {
  const proto = window.location.protocol === "https:" ? "https" : "http";
  return `${proto}://${window.location.hostname}:8000`;
}

export default function App() {
  const [page, setPage] = useState<"landing" | "gui">("landing");
  // In the GUI page: 0 = dashboard, 1 = terminals
  const [topTab, setTopTab] = useState(0);
  const [leftTab, setLeftTab] = useState(0);
  const [rightTab, setRightTab] = useState(0);
  const [termsMounted, setTermsMounted] = useState(false);

  useEffect(() => {
    if (page === "gui" && topTab === 1 && !termsMounted) setTermsMounted(true);
  }, [page, topTab, termsMounted]);

  const [busy, setBusy] = useState<string | null>(null);
  /** Per-sensor row: avoids global `busy` blocking all Activate/Deactivate buttons at once. */
  const [sensorRowBusy, setSensorRowBusy] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectedLabel, setConnectedLabel] = useState<string>("not connected");
  const [showJetsonPassword, setShowJetsonPassword] = useState(false);
  const [openDashboards, setOpenDashboards] = useState<string[]>([]);
  const [activeDashboardTargetId, setActiveDashboardTargetId] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    ok: boolean;
    sshTcpMs: number | null;
    rosbridgeTcpMs: number | null;
  } | null>(null);
  const [sensorRunning, setSensorRunning] = useState<Record<string, boolean>>({});
  const [sensorStatusLoading, setSensorStatusLoading] = useState(false);

  const [activeVessel, setActiveVessel] = useState<VesselKey>("AUV");
  const [connectedVehicles, setConnectedVehicles] = useState<ConnectedVehicle[]>([]);
  const connectedVehiclesRef = useRef<ConnectedVehicle[]>([]);
  const dropFailCountRef = useRef<Record<string, number>>({});
  const [vehicleNet, setVehicleNet] = useState<
    Record<string, { ok: boolean; sshTcpMs: number | null; rosbridgeTcpMs: number | null; updatedAtMs: number }>
  >({});
  const [auvConnectErr, setAuvConnectErr] = useState<string | null>(null);
  const [asvConnectErr, setAsvConnectErr] = useState<string | null>(null);
  const [auvProfile, setAuvProfile] = useState<VesselProfile>({
    user: "timi",
    host: "192.168.1.162",
    port: "22",
    password: "",
    auvDir: "/home/timi/AUV",
  });
  const [asvProfile, setAsvProfile] = useState<VesselProfile>({
    user: "sookshma",
    host: "",
    port: "22",
    password: "",
    auvDir: "/home/sookshma/ASV",
  });

  const activeProfile = activeVessel === "AUV" ? auvProfile : asvProfile;

  const jetsonUser = activeProfile.user;
  const jetsonHost = activeProfile.host;
  const jetsonPort = activeProfile.port;
  const jetsonPassword = activeProfile.password;
  const jetsonAuvDir = activeProfile.auvDir;

  const setJetsonUser = (v: string) =>
    (activeVessel === "AUV" ? setAuvProfile((p) => ({ ...p, user: v })) : setAsvProfile((p) => ({ ...p, user: v })));
  const setJetsonHost = (v: string) =>
    (activeVessel === "AUV" ? setAuvProfile((p) => ({ ...p, host: v })) : setAsvProfile((p) => ({ ...p, host: v })));
  const setJetsonPort = (v: string) =>
    (activeVessel === "AUV" ? setAuvProfile((p) => ({ ...p, port: v })) : setAsvProfile((p) => ({ ...p, port: v })));
  const setJetsonPassword = (v: string) =>
    (activeVessel === "AUV"
      ? setAuvProfile((p) => ({ ...p, password: v }))
      : setAsvProfile((p) => ({ ...p, password: v })));
  const setJetsonAuvDir = (v: string) =>
    (activeVessel === "AUV"
      ? setAuvProfile((p) => ({ ...p, auvDir: v }))
      : setAsvProfile((p) => ({ ...p, auvDir: v })));
  const [connTab, setConnTab] = useState(0);
  const [dockerRunning, setDockerRunning] = useState<boolean | null>(null);
  const [detectedContainer, setDetectedContainer] = useState<string | null>(null);
  const [allContainers, setAllContainers] = useState<{ name: string; image: string; status: string; id: string }[]>([]);
  const [dockerOp, setDockerOp] = useState<Record<string, "starting" | "stopping" | "refreshing" | null>>({});

  const [topics, setTopics] = useState<string[]>([]);
  const [nodes, setNodes] = useState<string[]>([]);
  const [usbDevices, setUsbDevices] = useState<string[]>([]);
  const [udevMap, setUdevMap] = useState<{ symlink: string; realDevice: string | null; status: string }[]>([]);
  // Per-vehicle caches so switching tabs shows that vehicle's data only.
  const topicsByTargetIdRef = useRef<Record<string, string[]>>({});
  const nodesByTargetIdRef = useRef<Record<string, string[]>>({});
  const usbByTargetIdRef = useRef<Record<string, string[]>>({});
  const udevMapByTargetIdRef = useRef<Record<string, { symlink: string; realDevice: string | null; status: string }[]>>({});
  const sensorRunningByTargetIdRef = useRef<Record<string, Record<string, boolean>>>({});
  const [udevRulesApplied, setUdevRulesApplied] = useState(
    () => typeof sessionStorage !== "undefined" && sessionStorage.getItem(UDEV_APPLIED_SESSION_KEY) === "1"
  );
  const [mrosText, setMrosText] = useState<string>("");
  const mrosWsRef = useRef<WebSocket | null>(null);
  const [topicFilter, setTopicFilter] = useState("");
  const [echoTopic, setEchoTopic] = useState<string>("");
  const [plotTopic, setPlotTopic] = useState<string>("");
  const [plotTopicFilter, setPlotTopicFilter] = useState<string>("");
  const [plotChartData, setPlotChartData] = useState<Record<string, number>[]>([]);
  const [plotSeriesKeys, setPlotSeriesKeys] = useState<string[]>([]);
  const [plotMsgTypeLabel, setPlotMsgTypeLabel] = useState<string>("");
  const [plotError, setPlotError] = useState<string | null>(null);
  const [plotLive, setPlotLive] = useState(false);

  // rosbridge is assumed to be a persistent service (no GUI-controlled start/stop).

  const [camTopic, setCamTopic] = useState<string>("");
  const [camImgUrl, setCamImgUrl] = useState<string>("");
  const [camErr, setCamErr] = useState<string>("");
  const [camMsgType, setCamMsgType] = useState<string>("");

  const [modemText, setModemText] = useState<string>("");
  const [modemTopics, setModemTopics] = useState<string[]>([]);
  const [modemTab, setModemTab] = useState(0);
  const [modemLogs, setModemLogs] = useState<Record<string, string>>({});
  const [dvlUrl, setDvlUrl] = useState<string>("");
  const modemSubRef = useRef<Record<string, any>>({});

  const [rosbagChecked, setRosbagChecked] = useState<Record<string, boolean>>({});
  const [rosbagRecording, setRosbagRecording] = useState(false);
  const [rosbagSelecting, setRosbagSelecting] = useState(false);
  const [rosbagChecking, setRosbagChecking] = useState(false);
  const [rosbagRuns, setRosbagRuns] = useState<string[]>([]);
  const [rosbagRunsLoading, setRosbagRunsLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [selectedRunMetadata, setSelectedRunMetadata] = useState<string>("");
  const [metadataLoading, setMetadataLoading] = useState(false);

  const [echoText, setEchoText] = useState<string>("");
  const [logText, setLogText] = useState<string>("");
  const [bottomTab, setBottomTab] = useState(0);
  const [logFrac, setLogFrac] = useState(0.25);
  const rightSplitRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const wsBase = useBackendBaseWsUrl();
  const httpBase = useBackendBaseHttpUrl();

  useEffect(() => {
    connectedVehiclesRef.current = connectedVehicles;
  }, [connectedVehicles]);

  const activeDashboard = useMemo(() => {
    if (!activeDashboardTargetId) return null;
    const v = connectedVehicles.find((x) => x.targetId === activeDashboardTargetId);
    if (!v) return null;
    return { targetId: v.targetId, label: v.label, host: v.profile.host };
  }, [activeDashboardTargetId, connectedVehicles]);

  const currentTargetId = activeDashboardTargetId;

  const apiFetch = useMemo(() => {
    return (path: string, init?: RequestInit, targetIdOverride?: string | null) => {
      const tid = targetIdOverride ?? currentTargetId;
      const headers = new Headers(init?.headers ?? undefined);
      if (tid) headers.set("x-target-id", tid);
      return fetch(`${httpBase}${path}`, { ...init, headers });
    };
  }, [currentTargetId, httpBase]);

  // When switching vehicle tabs, swap displayed lists to that vehicle's cached data.
  useEffect(() => {
    const tid = currentTargetId;
    if (!tid) return;
    setTopics(topicsByTargetIdRef.current[tid] ?? []);
    setNodes(nodesByTargetIdRef.current[tid] ?? []);
    setUsbDevices(usbByTargetIdRef.current[tid] ?? []);
    setUdevMap(udevMapByTargetIdRef.current[tid] ?? []);
    setSensorRunning(sensorRunningByTargetIdRef.current[tid] ?? {});
  }, [currentTargetId]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch(`/api/health`);
        const j = (await r.json().catch(() => null)) as { connected?: boolean; target?: string } | null;
        if (j && typeof j.connected === "boolean") {
          setConnected(j.connected);
          if (j.connected && j.target) setConnectedLabel(j.target);
          else if (!j.connected) setConnectedLabel("not connected");
        }
      } catch {
        /* ignore */
      }
    })();
  }, [httpBase]);

  const wsRef = useRef<WebSocket | null>(null);
  const plotFlushRafRef = useRef<number | null>(null);
  const rosRef = useRef<any | null>(null);
  const camSubRef = useRef<any | null>(null);
  const teleRosRef = useRef<any | null>(null);
  const teleRosHostRef = useRef<string | null>(null);
  const echoSubRef = useRef<any | null>(null);
  const plotSubRef = useRef<any | null>(null);
  const connectInFlightRef = useRef(false);
  // rosbridgeReachable is computed inline below

  const filteredTopics = useMemo(() => {
    const q = topicFilter.trim();
    if (!q) return topics;
    return topics.filter((t) => t.includes(q));
  }, [topics, topicFilter]);

  const plotFilteredTopics = useMemo(() => {
    const q = plotTopicFilter.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.toLowerCase().includes(q));
  }, [topics, plotTopicFilter]);

  function appendEcho(s: string) {
    setEchoText((prev) => {
      const next = prev + s;
      // keep last ~200k chars
      return next.length > 200_000 ? next.slice(next.length - 200_000) : next;
    });
  }

  function appendLog(s: string) {
    setLogText((prev) => {
      const next = prev + s;
      return next.length > 200_000 ? next.slice(next.length - 200_000) : next;
    });
  }

  function appendMros(s: string) {
    setMrosText((prev) => {
      const next = prev + s;
      return next.length > 200_000 ? next.slice(next.length - 200_000) : next;
    });
  }

  function stopMros() {
    const ws = mrosWsRef.current;
    mrosWsRef.current = null;
    if (ws) ws.close();
  }

  function startMros() {
    stopMros();
    setMrosText("");
    const qs = new URLSearchParams();
    if (currentTargetId) qs.set("targetId", currentTargetId);
    const ws = new WebSocket(`${wsBase}/ws/mros${qs.toString() ? `?${qs.toString()}` : ""}`);
    mrosWsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; chunk?: string; message?: string };
        if (msg.type === "status" && msg.message) appendMros(`[status] ${msg.message}\n`);
        if (msg.type === "out" && msg.chunk) appendMros(msg.chunk);
        if (msg.type === "err" && msg.chunk) appendMros(`[stderr] ${msg.chunk}`);
      } catch {
        appendMros(String(ev.data));
      }
    };
    ws.onclose = () => appendMros("\n[status] connection closed\n");
    ws.onerror = () => appendMros("\n[status] websocket error\n");
  }

  function getTeleRos(): any | null {
    const host = (activeDashboard?.host ?? jetsonHost).trim();
    if (!host) {
      appendLog("[rosbridge] missing jetson host\n");
      return null;
    }
    // If selected vehicle changed, drop the previous rosbridge connection so we don't
    // keep echo/plot/modem attached to the old vehicle.
    if (teleRosRef.current && teleRosHostRef.current && teleRosHostRef.current !== host) {
      try {
        teleRosRef.current.close?.();
      } catch {}
      teleRosRef.current = null;
    }
    if (teleRosRef.current) return teleRosRef.current;

    const ros = new ROSLIB.Ros({ url: `ws://${host}:9090` });
    teleRosRef.current = ros;
    teleRosHostRef.current = host;
    ros.on("connection", () => {
      // Connection success will naturally allow echo/plot/cameras to work.
    });
    ros.on("error", () => {
      appendLog("[rosbridge] connection error (is rosbridge running? port 9090 reachable?)\n");
    });
    ros.on("close", () => {
      // allow reconnect on next attempt
      teleRosRef.current = null;
      teleRosHostRef.current = null;
      appendLog("[rosbridge] connection closed\n");
    });
    return ros;
  }

  async function getTopicTypeViaRosapi(ros: any, topic: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      try {
        const svc = new ROSLIB.Service({
          ros,
          name: "/rosapi/topic_type",
          serviceType: "rosapi_msgs/srv/TopicType"
        });
        const req = new ROSLIB.ServiceRequest({ topic });
        svc.callService(req, (resp: any) => {
          const t = String(resp?.type ?? "");
          if (!t) reject(new Error("topic type not found"));
          else resolve(t);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * roslibjs is historically ROS1-shaped for type names (`pkg/Msg`), while rosapi on ROS2
   * commonly returns `pkg/msg/Msg`. Normalize so subscriptions actually deliver messages.
   */
  function normalizeRoslibMessageType(t: string): string {
    return t.replace(/^([^/]+)\/msg\/([^/]+)$/, "$1/$2");
  }

  function onStartDrag() {
    draggingRef.current = true;
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const el = rightSplitRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const y = e.clientY - r.top;
      const frac = 1 - y / r.height;
      const clamped = Math.max(0.25, Math.min(0.75, frac));
      setLogFrac(clamped);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  async function connect(profileOverride?: VesselProfile, vesselOverride?: VesselKey) {
    if (connectInFlightRef.current) return;
    const vessel = vesselOverride ?? activeVessel;
    const profile = profileOverride ?? (vessel === "AUV" ? auvProfile : asvProfile);
    if (vessel === "AUV") setAuvConnectErr(null);
    else setAsvConnectErr(null);
    // Prevent duplicates (especially for adding multiple AUVs)
    if (vessel === "AUV") {
      const u = profile.user.trim();
      const h = profile.host.trim();
      if (u && h) {
        const dup = connectedVehicles.some(
          (e) => e.vessel === "AUV" && e.profile.user.trim() === u && e.profile.host.trim() === h
        );
        if (dup) {
          appendLog(`[connect] skipped: vehicle already connected (${u}@${h})\n\n`);
          setAuvConnectErr("Vehicle already connected");
          return;
        }
      }
    }
    connectInFlightRef.current = true;
    setBusy("/api/connect");
    try {
      const r = await fetch(`${httpBase}/api/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: profile.host.trim(),
          user: profile.user.trim(),
          port: Number(profile.port || "22"),
          password: profile.password,
          auvDir: profile.auvDir.trim()
        })
      });
      const j = (await r.json()) as { ok?: boolean; stderr?: string; target?: string; containerName?: string; targetId?: string };
      if (!r.ok || !j.ok) {
        setConnected(false);
        setConnectedLabel("not connected");
        appendLog(`[connect] failed\n${j.stderr ?? "unknown error"}\n\n`);
        if (vessel === "AUV") setAuvConnectErr(j.stderr ?? "Connect failed");
        else setAsvConnectErr(j.stderr ?? "Connect failed");
        return;
      }
      const targetId = String(j.targetId ?? "").trim();
      if (!targetId) {
        throw new Error("backend did not return targetId");
      }
      setActiveVessel(vessel);
      setConnected(true);
      setConnectedLabel(j.target ?? "connected");
      setDetectedContainer(j.containerName ?? null);
      appendLog(`[connect] ok: ${j.target ?? ""}\n\n`);

      // Track connected vehicles (client-side list). Backend remains single-target; we can switch between entries.
      const newEntry: ConnectedVehicle = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        vessel,
        targetId,
        profile: { ...profile, password: "" }, // don't keep password in the list
        label: j.target ?? `${profile.user}@${profile.host}:${profile.port}`,
        connectedAtMs: Date.now(),
      };
      setConnectedVehicles((prev) => {
        // de-dupe by host+user+port+dir+vessel
        const key = `${vessel}|${profile.user}|${profile.host}|${profile.port}|${profile.auvDir}`;
        const filtered = prev.filter((e) => `${e.vessel}|${e.profile.user}|${e.profile.host}|${e.profile.port}|${e.profile.auvDir}` !== key);
        return [newEntry, ...filtered];
      });

      // Clear AUV fields after successful AUV connection so another AUV can be added quickly.
      if (vessel === "AUV") {
        setAuvProfile({
          user: "timi",
          host: "",
          port: "22",
          password: "",
          auvDir: "/home/timi/AUV",
        });
      } else {
        setAsvProfile((p) => ({ ...p, host: "", password: "" }));
      }

      // Do NOT auto-open a dashboard on connect.
      // Dashboard tabs are created only when user clicks "Dashboard" for a vehicle.

      // Auto-check docker status after connecting
      setTimeout(() => { fetchDockerStatus(); fetchRosbagStatus(); }, 500);
    } catch (e) {
      setConnected(false);
      setConnectedLabel("not connected");
      appendLog(`[connect] error: ${String(e)}\n\n`);
      if (vessel === "AUV") setAuvConnectErr(String(e));
      else setAsvConnectErr(String(e));
    } finally {
      setBusy(null);
      connectInFlightRef.current = false;
    }
  }

  function closeDashboardTab(targetId: string) {
    // Closing a dashboard tab only hides that dashboard view (keeps vehicle connected).
    setOpenDashboards((prev) => {
      const next = prev.filter((id) => id !== targetId);
      if (next.length === 0) {
        setActiveDashboardTargetId(null);
        setPage("landing");
        stopEcho();
        stopPlot();
        stopCamera();
        stopModemEchos();
        stopMros();
      } else if (activeDashboardTargetId === targetId) {
        setActiveDashboardTargetId(next[0]);
      }
      return next;
    });
  }

  const auvConnectedLabel = connected && activeVessel === "AUV" ? connectedLabel : null;
  const asvConnectedLabel = connected && activeVessel === "ASV" ? connectedLabel : null;

  async function ensureVesselActive(vessel: VesselKey): Promise<boolean> {
    const profile = vessel === "AUV" ? auvProfile : asvProfile;
    // If we’re already connected to this vessel, nothing to do.
    if (connected && activeVessel === vessel) return true;
    // Otherwise switch credentials + reconnect backend target.
    await connect(profile, vessel);
    return true;
  }

  async function ensureBackendConnected(): Promise<boolean> {
    try {
      const r = await apiFetch(`/api/health`);
      const j = (await r.json().catch(() => null)) as null | { connected?: boolean; target?: string };
      const ok = !!j?.connected;
      if (ok) return true;
    } catch {
      // fall through to reconnect attempt
    }

    // Backend lost state (restart) or never connected; re-run connect using current form values.
    await connect();
    try {
      const r2 = await apiFetch(`/api/health`);
      const j2 = (await r2.json().catch(() => null)) as null | { connected?: boolean };
      return !!j2?.connected;
    } catch {
      return false;
    }
  }

  async function postJson(path: string) {
    setBusy(path);
    try {
      const r = await fetch(`${httpBase}${path}`, { method: "POST" });
      const j = (await r.json()) as { code: number; stdout?: string; stderr?: string };
      appendLog(`[${path}] exit=${j.code}\n`);
      if (j.stdout) appendLog(j.stdout);
      if (j.stderr) appendLog(`\n[stderr]\n${j.stderr}\n`);
      appendLog("\n");

      if (path === "/api/sensors/activate" || path === "/api/sensors/deactivate") {
        void refreshTopics();
        void refreshNodes();
        void fetchSensorStatus();
      }

    } catch (e) {
      appendEcho(`[${path}] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function postSensorAction(path: string, sensorId: string) {
    setSensorRowBusy(sensorId);
    try {
      const r = await apiFetch(path, { method: "POST" });
      const j = (await r.json()) as {
        code: number;
        stdout?: string;
        stderr?: string;
        skipped?: boolean;
      };
      appendLog(`[${path}] exit=${j.code}${j.skipped ? " (already running, skipped)" : ""}\n`);
      if (j.stdout) appendLog(j.stdout);
      if (j.stderr) appendLog(`\n[stderr]\n${j.stderr}\n`);
      appendLog("\n");
      void fetchSensorStatus();
    } catch (e) {
      appendEcho(`[${path}] error: ${String(e)}\n\n`);
    } finally {
      setSensorRowBusy(null);
    }
  }

  async function fetchSensorStatus(silent = false) {
    if (!silent) setSensorStatusLoading(true);
    try {
      const tid = currentTargetId;
      const ids = [
        "dvl",
        "sbg",
        "ping2",
        "ping360",
        "frontcam",
        "bottomcam",
        "modem",
        "bar30_ps",
      ] as const;
      // Update per-sensor so one slow/failing check doesn't freeze the whole panel.
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await apiFetch(`/api/sensors/status/${id}`);
            if (!r.ok) return [id, null] as const;
            const j = (await r.json()) as { running?: boolean };
            return [id, typeof j.running === "boolean" ? j.running : null] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );

      setSensorRunning((prev) => {
        const next: Record<string, boolean> = { ...prev };
        for (const [id, running] of results) {
          if (typeof running === "boolean") next[id] = running;
        }
        // Ensure sensors that are missing default to false (prevents stale green indicators).
        for (const id of ids) {
          if (typeof next[id] !== "boolean") next[id] = false;
        }
        return next;
      });
      if (tid) {
        sensorRunningByTargetIdRef.current[tid] = sensorRunningByTargetIdRef.current[tid] ?? {};
        const next: Record<string, boolean> = { ...(sensorRunningByTargetIdRef.current[tid] ?? {}) };
        for (const [id, running] of results) {
          if (typeof running === "boolean") next[id] = running;
        }
        for (const id of ids) {
          if (typeof next[id] !== "boolean") next[id] = false;
        }
        sensorRunningByTargetIdRef.current[tid] = next;
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setSensorStatusLoading(false);
    }
  }

  async function refreshTopics() {
    setBusy("/api/ros/topics");
    try {
      const r = await apiFetch(`/api/ros/topics`);
      const j = (await r.json()) as TopicsResponse;
      if ("topics" in j) {
        setTopics(j.topics);
        if (currentTargetId) topicsByTargetIdRef.current[currentTargetId] = j.topics;
      } else {
        appendLog(`[topics] failed (exit=${j.code})\n${j.stderr}\n\n`);
      }
    } catch (e) {
      appendLog(`[topics] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function refreshNodes() {
    setBusy("/api/ros/nodes");
    try {
      const r = await apiFetch(`/api/ros/nodes`);
      const j = (await r.json()) as NodesResponse;
      if ("nodes" in j) {
        setNodes(j.nodes);
        if (currentTargetId) nodesByTargetIdRef.current[currentTargetId] = j.nodes;
      } else {
        appendLog(`[nodes] failed (exit=${j.code})\n${j.stderr}\n\n`);
      }
    } catch (e) {
      appendLog(`[nodes] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function refreshUsbDevices() {
    setBusy("/api/devices/usb");
    try {
      const r = await apiFetch(`/api/devices/usb`);
      const j = (await r.json()) as UsbDevicesResponse;
      if ("devices" in j) {
        setUsbDevices(j.devices);
        if (currentTargetId) usbByTargetIdRef.current[currentTargetId] = j.devices;
      } else {
        appendLog(`[devices] failed (exit=${j.code})\n${j.stderr}\n\n`);
      }
    } catch (e) {
      appendLog(`[devices] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function fetchUdevMap() {
    try {
      const r = await apiFetch(`/api/devices/udev-map`);
      const j = (await r.json()) as { mappings: { symlink: string; realDevice: string | null; status: string }[] };
      setUdevMap(j.mappings ?? []);
      if (currentTargetId) udevMapByTargetIdRef.current[currentTargetId] = j.mappings ?? [];
    } catch {
      setUdevMap([]);
      if (currentTargetId) udevMapByTargetIdRef.current[currentTargetId] = [];
    }
  }

  async function applyUdevRules() {
    setBusy("/api/devices/udev");
    try {
      const r = await apiFetch(`/api/devices/udev`, { method: "POST" });
      const j = (await r.json()) as { code: number; stdout?: string; stderr?: string };
      if (j.code !== 0) {
        appendLog(`[udev] failed (exit=${j.code})\n${j.stderr ?? ""}\n\n`);
      } else {
        appendLog(`[udev] rules applied successfully\n\n`);
        setUdevRulesApplied(true);
        try {
          sessionStorage.setItem(UDEV_APPLIED_SESSION_KEY, "1");
        } catch {
          /* ignore */
        }
        await fetchUdevMap();
      }
    } catch (e) {
      appendLog(`[udev] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  function stopEcho() {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) ws.close();
    try {
      echoSubRef.current?.unsubscribe();
    } catch {}
    echoSubRef.current = null;
  }

  async function startEcho() {
    const topic = echoTopic.trim();
    if (!topic) {
      appendEcho("[echo] pick a topic first\n\n");
      return;
    }

    stopEcho();
    setEchoText("");
    appendEcho(`[echo] subscribing via rosbridge: ${topic}\n`);

    const ros = getTeleRos();
    if (!ros) return;

    try {
      const messageType = await getTopicTypeViaRosapi(ros, topic);
      const roslibType = normalizeRoslibMessageType(messageType);
      appendEcho(`[echo] type: ${messageType}${roslibType !== messageType ? ` (roslib: ${roslibType})` : ""}\n`);
      const sub = new ROSLIB.Topic({ ros, name: topic, messageType: roslibType });
      echoSubRef.current = sub;
      sub.subscribe((msg: any) => {
        try {
          appendEcho(JSON.stringify(msg) + "\n");
        } catch {
          appendEcho(String(msg) + "\n");
        }
      });
    } catch (e) {
      appendEcho(`[echo] error: ${String(e)}\n`);
    }
  }

  function stopPlot() {
    if (plotFlushRafRef.current != null) {
      cancelAnimationFrame(plotFlushRafRef.current);
      plotFlushRafRef.current = null;
    }
    try {
      plotSubRef.current?.unsubscribe();
    } catch {}
    plotSubRef.current = null;
    setPlotChartData([]);
    setPlotSeriesKeys([]);
    setPlotMsgTypeLabel("");
    setPlotError(null);
    setPlotLive(false);
  }

  async function startPlot() {
    const topic = plotTopic.trim();
    if (!topic) {
      setPlotError("Select a topic from the list (or type a name).");
      return;
    }
    stopPlot();
    setPlotError(null);

    const ros = getTeleRos();
    if (!ros) {
      setPlotError("Rosbridge not connected. Check vehicle status and port 9090.");
      return;
    }

    const t0 = Date.now();
    const buffer: Array<Record<string, number>> = [];
    const lastVals: Record<string, number> = {};
    const keysSeen = new Set<string>();
    const MAX_POINTS = 500;

    const scheduleFlush = () => {
      if (plotFlushRafRef.current != null) return;
      plotFlushRafRef.current = requestAnimationFrame(() => {
        plotFlushRafRef.current = null;
        setPlotChartData([...buffer]);
        setPlotSeriesKeys(Array.from(keysSeen).sort());
      });
    };

    try {
      const messageType = await getTopicTypeViaRosapi(ros, topic);
      const roslibType = normalizeRoslibMessageType(messageType);
      setPlotMsgTypeLabel(messageType);

      const sub = new ROSLIB.Topic({ ros, name: topic, messageType: roslibType });
      plotSubRef.current = sub;
      setPlotLive(true);

      sub.subscribe((msg: unknown) => {
        const { series, keys } = extractNumericSeries(msg, messageType);
        if (keys.length === 0) return;

        for (const k of keys) {
          const v = series[k];
          if (typeof v === "number" && Number.isFinite(v)) {
            lastVals[k] = v;
            keysSeen.add(k);
          }
        }

        const tRel = (Date.now() - t0) / 1000;
        const row: Record<string, number> = { tRel };
        for (const k of keysSeen) {
          if (k in lastVals) row[k] = lastVals[k];
        }
        buffer.push(row);
        if (buffer.length > MAX_POINTS) buffer.shift();
        scheduleFlush();
      });
    } catch (e) {
      setPlotLive(false);
      setPlotError(String(e));
    }
  }

  // (start/stop rosbridge removed)

  function stopCamera() {
    camSubRef.current?.unsubscribe();
    camSubRef.current = null;
    rosRef.current?.close();
    rosRef.current = null;
    if (camImgUrl && camImgUrl.startsWith("blob:")) URL.revokeObjectURL(camImgUrl);
    setCamImgUrl("");
    setCamMsgType("");
  }

  function startCamera() {
    const topic = camTopic.trim();
    if (!topic) {
      setCamErr("Pick a camera topic first.");
      return;
    }
    setCamErr("");
    stopCamera();

    const host = (activeDashboard?.host ?? jetsonHost).trim();
    if (!host) {
      setCamErr("Missing vehicle host. Select a connected vehicle (or enter a host) and try again.");
      return;
    }

    const ros = new ROSLIB.Ros({
      url: `ws://${host}:9090`
    });
    rosRef.current = ros;

    ros.on("connection", () => {
      // If we can connect, the camera subscription will start receiving frames.
    });
    ros.on("error", () => {
      setCamErr("Rosbridge connection failed. Start rosbridge and ensure port 9090 reachable.");
    });
    ros.on("close", () => {
      // ignore
    });

    const bytesFromRosbridgeField = (data: unknown): Uint8Array => {
      if (typeof data === "string") {
        const byteChars = atob(data);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        return bytes;
      }
      if (Array.isArray(data)) return Uint8Array.from(data.map((v) => Number(v) & 0xff));
      throw new Error(`Unsupported data field type: ${typeof data}`);
    };

    void (async () => {
      try {
        const messageType = await getTopicTypeViaRosapi(ros, topic);
        const roslibType = normalizeRoslibMessageType(messageType);
        setCamMsgType(messageType);

        const sub = new ROSLIB.Topic({ ros, name: topic, messageType: roslibType });
        camSubRef.current = sub;

        sub.subscribe((msg: any) => {
          try {
            // Compressed image (jpeg/png) via rosbridge base64 string.
            if (messageType === "sensor_msgs/msg/CompressedImage" || messageType === "sensor_msgs/CompressedImage") {
              const mime = msg.format && String(msg.format).includes("png") ? "image/png" : "image/jpeg";
              const bytes = bytesFromRosbridgeField(msg.data);
              const safeBytes = new Uint8Array(bytes);
              const blob = new Blob([safeBytes], { type: mime });
              const url = URL.createObjectURL(blob);
              setCamImgUrl((prev) => {
                if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
                return url;
              });
              return;
            }

            // Raw sensor_msgs/Image. For Ping360 this is typically mono8.
            if (messageType === "sensor_msgs/msg/Image" || messageType === "sensor_msgs/Image") {
              const width = Number(msg.width ?? 0);
              const height = Number(msg.height ?? 0);
              const encoding = String(msg.encoding ?? "");
              const dataBytes = bytesFromRosbridgeField(msg.data);

              if (!width || !height) throw new Error("Image missing width/height");

              if (encoding !== "mono8") {
                throw new Error(`Unsupported encoding: ${encoding} (only mono8 supported)`);
              }

              // Convert mono8 → RGBA and render via canvas → blob URL.
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("2d canvas context unavailable");
              const imgData = ctx.createImageData(width, height);
              const rgba = imgData.data;
              const n = Math.min(dataBytes.length, width * height);
              for (let i = 0; i < n; i++) {
                const v = dataBytes[i]!;
                const j = i * 4;
                rgba[j] = v;
                rgba[j + 1] = v;
                rgba[j + 2] = v;
                rgba[j + 3] = 255;
              }
              ctx.putImageData(imgData, 0, 0);
              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    setCamErr("Render error: canvas.toBlob returned null");
                    return;
                  }
                  const url = URL.createObjectURL(blob);
                  setCamImgUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return url;
                  });
                },
                "image/png",
                0.92
              );
              return;
            }

            // Fallback: show decode/type error.
            throw new Error(`Unsupported image message type: ${messageType}`);
          } catch (e) {
            setCamErr(`Decode error: ${String(e)}`);
          }
        });
      } catch (e) {
        setCamErr(`Subscribe error: ${String(e)}`);
      }
    })();
  }

  function stopModemEchos() {
    const m = modemSubRef.current;
    for (const k of Object.keys(m)) {
      try {
        m[k].unsubscribe();
      } catch {}
    }
    modemSubRef.current = {};
  }

  async function ensureModemEchos(nextTopics: string[]) {
    const desired = nextTopics.slice(0, 4);
    setModemTopics(desired);
    setModemTab((t) => (t >= desired.length ? 0 : t));

    // close removed
    for (const existing of Object.keys(modemSubRef.current)) {
      if (!desired.includes(existing)) {
        try {
          modemSubRef.current[existing].unsubscribe();
        } catch {}
        delete modemSubRef.current[existing];
      }
    }

    const ros = getTeleRos();
    if (!ros) return;

    for (const topic of desired) {
      if (modemSubRef.current[topic]) continue;
      setModemLogs((prev) => ({ ...prev, [topic]: prev[topic] ?? "" }));

      try {
        const messageType = await getTopicTypeViaRosapi(ros, topic);
        const roslibType = normalizeRoslibMessageType(messageType);
        const sub = new ROSLIB.Topic({ ros, name: topic, messageType: roslibType });
        modemSubRef.current[topic] = sub;
        sub.subscribe((msg: any) => {
          setModemLogs((prev) => {
            const cur = prev[topic] ?? "";
            const line = (() => {
              try {
                return JSON.stringify(msg);
              } catch {
                return String(msg);
              }
            })();
            const next = (cur + line + "\n").slice(-80_000);
            return { ...prev, [topic]: next };
          });
        });
      } catch (e) {
        appendLog(`[modem] subscribe error for ${topic}: ${String(e)}\n`);
      }
    }
  }

  async function sendModem() {
    const data = modemText.trim();
    if (!data) {
      appendLog("[modem] enter up to 8 characters\n\n");
      return;
    }
    setBusy("/api/modem/send");
    try {
      const r = await apiFetch(`/api/modem/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data })
      });
      const j = (await r.json()) as { code: number; stderr?: string; stdout?: string };
      appendLog(`[/api/modem/send] exit=${j.code}\n`);
      if (j.stdout) appendLog(j.stdout);
      if (j.stderr) appendLog(`\n[stderr]\n${j.stderr}\n`);
      appendLog("\n");

      // refresh & keep modem echos running
      await refreshTopics();
      const available = topics.filter((t) => t.includes("/modem/"));
      void ensureModemEchos(available);
    } catch (e) {
      appendLog(`[/api/modem/send] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function startDvlTunnel() {
    setBusy("/api/dvl/tunnel/start");
    try {
      const r = await apiFetch(`/api/dvl/tunnel/start`, { method: "POST" });
      const j = (await r.json()) as { code: number; stdout?: string; stderr?: string };
      if (j.code !== 0) {
        appendLog(`[/api/dvl/tunnel/start] exit=${j.code}\n${j.stderr ?? ""}\n\n`);
        return;
      }
      const url = "http://localhost:8080";
      setDvlUrl(url);
      appendLog("[dvl] tunnel ready: http://localhost:8080\n\n");
    } catch (e) {
      appendLog(`[/api/dvl/tunnel/start] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function fetchDockerStatus() {
    try {
      const r = await apiFetch(`/api/docker/status`);
      const j = (await r.json()) as { running: boolean; containerName?: string };
      setDockerRunning(j.running);
      if (j.containerName) setDetectedContainer(j.containerName);
    } catch {
      setDockerRunning(null);
    }
    fetchContainerList();
  }

  async function fetchDockerStatusFor(targetId: string) {
    try {
      const r = await apiFetch(`/api/docker/status`, undefined, targetId);
      const j = (await r.json()) as { running: boolean; containerName?: string };
      // This panel currently renders one docker status area at a time (latest-selected vehicle),
      // so we keep using the shared dockerRunning/detectedContainer state but refresh it with
      // the requested targetId.
      setDockerRunning(j.running);
      if (j.containerName) setDetectedContainer(j.containerName);
    } catch {
      setDockerRunning(null);
    }
    fetchContainerList();
  }

  async function startContainer() {
    setBusy("/api/docker/start");
    try {
      const r = await apiFetch(`/api/docker/start`, { method: "POST" });
      const j = (await r.json()) as { code: number; stdout?: string; stderr?: string; containerName?: string };
      if (j.code !== 0) {
        appendLog(`[docker] start failed\n${j.stderr ?? ""}\n\n`);
        return;
      }
      appendLog(`[docker] container started\n\n`);
      if (j.containerName) setDetectedContainer(j.containerName);
      setDockerRunning(true);
      fetchContainerList();
    } catch (e) {
      appendLog(`[docker] start error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function stopContainer() {
    setBusy("/api/docker/stop");
    try {
      const r = await apiFetch(`/api/docker/stop`, { method: "POST" });
      const j = (await r.json()) as { code: number; stdout?: string; stderr?: string };
      appendLog(`[docker] container stopped\n\n`);
      setDockerRunning(false);
      fetchContainerList();
    } catch (e) {
      appendLog(`[docker] stop error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function fetchContainerList() {
    try {
      const r = await apiFetch(`/api/docker/list`);
      const j = (await r.json()) as { containers: { name: string; image: string; status: string; id: string }[] };
      setAllContainers(j.containers ?? []);
    } catch {
      setAllContainers([]);
    }
  }

  async function killContainer(name: string) {
    setBusy(`/api/docker/kill/${name}`);
    try {
      await apiFetch(`/api/docker/kill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      appendLog(`[docker] killed & removed: ${name}\n\n`);
      await fetchContainerList();
      await fetchDockerStatus();
    } catch (e) {
      appendLog(`[docker] kill error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function fetchRosbagStatus() {
    setRosbagChecking(true);
    try {
      const r = await apiFetch(`/api/rosbag/status`);
      if (!r.ok) {
        setRosbagRecording(false);
        return;
      }
      const j = (await r.json()) as { recording: boolean; bagName?: string | null };
      setRosbagRecording(j.recording);
      if (j.recording) setRosbagSelecting(false);
    } catch (e) {
      setRosbagRecording(false);
    } finally {
      setRosbagChecking(false);
    }
  }

  async function fetchRosbagRuns() {
    setRosbagRunsLoading(true);
    try {
      const r = await apiFetch(`/api/rosbag/runs`);
      if (r.ok) {
        const j = (await r.json()) as { runs: string[] };
        setRosbagRuns(j.runs);
      }
    } catch {
      /* ignore */
    } finally {
      setRosbagRunsLoading(false);
    }
  }

  async function fetchRunMetadata(name: string) {
    setSelectedRun(name);
    setSelectedRunMetadata("");
    setMetadataLoading(true);
    try {
      const r = await apiFetch(`/api/rosbag/runs/${encodeURIComponent(name)}/metadata`);
      if (r.ok) {
        const j = (await r.json()) as { metadata: string };
        setSelectedRunMetadata(j.metadata);
      } else {
        setSelectedRunMetadata("metadata.yaml not found");
      }
    } catch {
      setSelectedRunMetadata("Failed to fetch metadata");
    } finally {
      setMetadataLoading(false);
    }
  }

  async function deleteRosbagRun(name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      const r = await apiFetch(`/api/rosbag/runs/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (r.ok) {
        appendLog(`[rosbag] deleted ${name}\n\n`);
        if (selectedRun === name) {
          setSelectedRun(null);
          setSelectedRunMetadata("");
        }
        fetchRosbagRuns();
      } else {
        appendLog(`[rosbag] failed to delete ${name}\n\n`);
      }
    } catch (e) {
      appendLog(`[rosbag] error deleting ${name}: ${String(e)}\n\n`);
    }
  }

  async function startRosbag() {
    const selected = topics.filter((t) => rosbagChecked[t]);
    if (selected.length === 0) {
      appendLog("[rosbag] select at least one topic\n\n");
      return;
    }
    setBusy("/api/rosbag/start");
    try {
      const r = await apiFetch(`/api/rosbag/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics: selected }),
      });
      const j = (await r.json()) as { code: number; stdout?: string; stderr?: string; bagName?: string };
      if (j.code !== 0) {
        appendLog(`[rosbag] error: ${j.stderr ?? "unknown"}\n\n`);
        return;
      }
      setRosbagRecording(true);
      setRosbagSelecting(false);
      appendLog(`[rosbag] data collection started → ${j.bagName ?? "rosbags/"}\n\n`);
    } catch (e) {
      appendLog(`[rosbag] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  async function stopRosbag() {
    setBusy("/api/rosbag/stop");
    try {
      const r = await apiFetch(`/api/rosbag/stop`, { method: "POST" });
      const j = (await r.json()) as { code: number; stdout?: string; bagName?: string | null };
      setRosbagRecording(false);
      setRosbagSelecting(false);
      appendLog(`[rosbag] data collection stopped → ${j.bagName ?? "run?"}\n\n`);
      fetchRosbagRuns();
    } catch (e) {
      appendLog(`[rosbag] error: ${String(e)}\n\n`);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const r = await apiFetch(`/api/status`);
        const j = (await r.json()) as {
          ok?: boolean;
          sshTcpMs?: number | null;
          rosbridgeTcpMs?: number | null;
        };
        if (typeof j.ok === "boolean") {
          setStatus({
            ok: j.ok,
            sshTcpMs: j.sshTcpMs ?? null,
            rosbridgeTcpMs: j.rosbridgeTcpMs ?? null
          });
        }
      } catch {
        setStatus(null);
      }
    }, 2000);
    return () => {
      window.clearInterval(id);
      stopEcho();
      stopPlot();
      stopCamera();
      stopModemEchos();
      stopMros();
      try {
        teleRosRef.current?.close();
      } catch {}
      teleRosRef.current = null;
      teleRosHostRef.current = null;
    };
  }, [apiFetch]);

  // When user switches the active vehicle dashboard tab, ensure all live streams
  // (rosbridge subscriptions, ws streams) are disconnected so the UI can't show data
  // from the previously selected vehicle.
  useEffect(() => {
    stopEcho();
    stopPlot();
    stopCamera();
    stopModemEchos();
    stopMros();
    try {
      teleRosRef.current?.close();
    } catch {}
    teleRosRef.current = null;
    teleRosHostRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTargetId]);

  function removeConnectedVehicle(targetId: string) {
    const cur = connectedVehiclesRef.current;
    const entry = cur.find((x) => x.targetId === targetId) ?? null;
    if (!entry) return;

    // Remove from client-side list and close any dashboard tab for it.
    setConnectedVehicles((prev) => prev.filter((x) => x.targetId !== targetId));
    setOpenDashboards((prev) => prev.filter((id) => id !== targetId));
    setActiveDashboardTargetId((curTid) => {
      if (curTid !== targetId) return curTid;
      const next = connectedVehiclesRef.current.find((x) => x.targetId !== targetId);
      return next?.targetId ?? null;
    });

    // Tell backend to delete the session (best-effort).
    void apiFetch(`/api/disconnect`, { method: "POST" }, targetId).catch(() => null);

    // If this was active, clean up dashboard resources and reflect disconnected state.
    if (activeDashboardTargetId === targetId) {
      stopEcho();
      stopPlot();
      stopCamera();
      stopModemEchos();
      stopMros();
      setConnected(false);
      setConnectedLabel("not connected");
    }

    delete dropFailCountRef.current[targetId];
    setVehicleNet((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
  }

  // Auto-prune vehicles that drop off the network.
  useEffect(() => {
    const intervalMs = 4000;
    const maxConsecutiveFails = 3;
    let cancelled = false;

    const tick = async () => {
      const list = connectedVehiclesRef.current;
      if (list.length === 0) return;
      await Promise.allSettled(
        list.map(async (v) => {
          try {
            const r = await fetch(`${httpBase}/api/status`, { headers: { "x-target-id": v.targetId } });
            const j = (await r.json().catch(() => null)) as
              | null
              | { ok?: boolean; sshTcpMs?: number | null; rosbridgeTcpMs?: number | null };
            const ok = !!j?.ok;
            setVehicleNet((prev) => ({
              ...prev,
              [v.targetId]: {
                ok,
                sshTcpMs: typeof j?.sshTcpMs === "number" ? j!.sshTcpMs! : null,
                rosbridgeTcpMs: typeof j?.rosbridgeTcpMs === "number" ? j!.rosbridgeTcpMs! : null,
                updatedAtMs: Date.now(),
              },
            }));
            const curFails = dropFailCountRef.current[v.targetId] ?? 0;
            dropFailCountRef.current[v.targetId] = ok ? 0 : curFails + 1;
            if (!ok && (dropFailCountRef.current[v.targetId] ?? 0) >= maxConsecutiveFails && !cancelled) {
              removeConnectedVehicle(v.targetId);
            }
          } catch {
            const curFails = dropFailCountRef.current[v.targetId] ?? 0;
            dropFailCountRef.current[v.targetId] = curFails + 1;
            if ((dropFailCountRef.current[v.targetId] ?? 0) >= maxConsecutiveFails && !cancelled) {
              removeConnectedVehicle(v.targetId);
            }
          }
        })
      );
    };

    const id = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [httpBase]);

  useEffect(() => {
    if (page === "gui" && topTab === 0 && rightTab === 5) {
      fetchRosbagStatus();
      fetchRosbagRuns();
      setSelectedRun(null);
      setSelectedRunMetadata("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, topTab, rightTab]);

  useEffect(() => {
    if (page !== "gui" || topTab !== 0 || leftTab !== 1) return;
    void fetchSensorStatus(false);
    const id = window.setInterval(() => {
      void fetchSensorStatus(true);
    }, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, topTab, leftTab]);

  const rosbridgeReachable = status?.rosbridgeTcpMs !== null && status?.rosbridgeTcpMs !== undefined;

  // Landing page (multi-vessel + SSH/Docker)
  if (page === "landing") {
    const renderDockerDetails = (
      auvDir: string,
      opts: { targetId: string; onStart: () => void; onStop: () => void; onRefresh: () => void }
    ) => {
      const op = dockerOp[opts.targetId] ?? null;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            Uses <code>{auvDir}/.devcontainer/docker-compose.yml</code> on the vehicle.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="success"
              disabled={!!busy || op === "starting" || op === "stopping" || dockerRunning === true}
              onClick={opts.onStart}
            >
              {op === "starting" ? "Starting..." : "Start Container"}
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={!!busy || op === "starting" || op === "stopping" || dockerRunning === false}
              onClick={opts.onStop}
            >
              {op === "stopping" ? "Stopping..." : "Stop Container"}
            </Button>
            <Button variant="outlined" disabled={!!busy || op === "refreshing"} onClick={opts.onRefresh}>
              {op === "refreshing" ? "Refreshing..." : "Refresh"}
            </Button>
          </Box>
          {op === "stopping" && <Alert severity="info">Stopping container… refreshing status.</Alert>}
          {dockerRunning === true && <Alert severity="success">Compose stack is running.</Alert>}
          {dockerRunning === false && <Alert severity="info">Compose stack is not running.</Alert>}
          {dockerRunning === null && <Alert severity="info">Docker status unknown.</Alert>}

          <Divider sx={{ my: 0.5 }} />

          <Typography variant="subtitle1">All Running Containers</Typography>
          {allContainers.length === 0 ? (
            <Typography variant="body2" sx={{ opacity: 0.6 }}>
              No running containers found.
            </Typography>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 1,
                alignItems: "stretch",
              }}
            >
              {allContainers.map((c) => (
                <Paper
                  key={c.id}
                  variant="outlined"
                  sx={{ p: 1.25, display: "flex", alignItems: "center", gap: 2 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: "monospace" }}>
                      {c.name}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7, fontFamily: "monospace" }}>
                      {c.image}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                      {c.status}
                    </Typography>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Box>
      );
    };

    return (
      <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <AppBar position="static" sx={{ backgroundColor: "#1565c0" }}>
          <Toolbar sx={{ justifyContent: "center" }}>
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.8 }}>
              Marine Autonomous Vehicles Laboratory GUI
            </Typography>
          </Toolbar>
        </AppBar>

        <Landing
          auv={auvProfile}
          asv={asvProfile}
          busy={!!busy}
          auvErrorText={auvConnectErr}
          asvErrorText={asvConnectErr}
          onChange={(vessel, next) => {
            if (vessel === "AUV") {
              setAuvProfile(next);
              setAuvConnectErr(null);
            } else {
              setAsvProfile(next);
              setAsvConnectErr(null);
            }
          }}
          onConnect={(vessel) => {
            setActiveVessel(vessel);
            void connect(vessel === "AUV" ? auvProfile : asvProfile, vessel);
          }}
          rightPane={
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                backgroundColor: "rgba(21, 101, 192, 0.03)",
                borderColor: "rgba(21, 101, 192, 0.35)",
              }}
            >
              <Typography variant="h6" sx={{ mb: 1 }}>
                Connected vehicles
              </Typography>
              {connectedVehicles.length === 0 ? (
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  No vehicles connected yet.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {connectedVehicles.map((e) => {
                    const isActive = e.targetId === activeDashboardTargetId;
                    const net = vehicleNet[e.targetId] ?? null;
                    const pingMs = typeof net?.sshTcpMs === "number" ? net!.sshTcpMs : null;
                    const bars = (() => {
                      if (!net?.ok) return 0;
                      if (pingMs === null) return 1;
                      if (pingMs < 80) return 4;
                      if (pingMs < 150) return 3;
                      if (pingMs < 250) return 2;
                      return 1;
                    })();
                    return (
                      <Paper
                        key={e.id}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                            p: 1,
                            borderRadius: 1,
                            // Always highlight connected vehicles; use border to hint which one is active.
                            backgroundColor: "rgba(245, 214, 0, 0.95)",
                            border: isActive ? "2px solid rgba(0,0,0,0.55)" : "1px solid rgba(0,0,0,0.25)",
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontFamily: "monospace",
                                color: "rgba(0,0,0,0.92)",
                              }}
                            >
                              {e.vessel} — {e.profile.user}@{e.profile.host}:{e.profile.port}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                opacity: 0.9,
                                fontFamily: "monospace",
                                color: "rgba(0,0,0,0.85)",
                              }}
                            >
                              dir: {e.profile.auvDir}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.35 }}>
                                  {[1, 2, 3, 4].map((i) => (
                                    <Box
                                      key={i}
                                      sx={{
                                        width: 4,
                                        height: 4 + i * 3,
                                        borderRadius: 0.5,
                                        backgroundColor:
                                          i <= bars ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0.25)",
                                      }}
                                    />
                                  ))}
                                </Box>
                                <Typography
                                  variant="caption"
                                  sx={{ fontFamily: "monospace", color: "rgba(0,0,0,0.92)" }}
                                >
                                  {pingMs === null ? "— ms" : `${pingMs} ms`}
                                </Typography>
                              </Box>
                            }
                            sx={{ color: "rgba(0,0,0,0.92)" }}
                          />
                        </Box>

                        <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={!!busy}
                            onClick={() => {
                              void (async () => {
                                setActiveDashboardTargetId(e.targetId);
                                setOpenDashboards((prev) => (prev.includes(e.targetId) ? prev : [e.targetId, ...prev]));
                                setPage("gui");
                              })();
                            }}
                          >
                            Dashboard
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={!!busy}
                            onClick={() => {
                              const tid = e.targetId;
                              setConnectedVehicles((prev) => prev.filter((x) => x.id !== e.id));
                              setOpenDashboards((prev) => prev.filter((id) => id !== tid));
                              setActiveDashboardTargetId((cur) => {
                                if (cur !== tid) return cur;
                                // Switch to another connected vehicle if available.
                                const next = connectedVehicles.find((x) => x.targetId !== tid);
                                return next?.targetId ?? null;
                              });
                              // Tell backend to delete the session.
                              void apiFetch(`/api/disconnect`, { method: "POST" }, tid).catch(() => null);
                              // If this is currently active, mark disconnected in UI.
                              if (isActive) {
                                stopEcho();
                                stopPlot();
                                stopCamera();
                                stopModemEchos();
                                stopMros();
                                setConnected(false);
                                setConnectedLabel("not connected");
                              }
                            }}
                          >
                            Disconnect
                          </Button>
                        </Box>

                        <Box sx={{ mt: 1 }}>
                          {renderDockerDetails(e.profile.auvDir, {
                            targetId: e.targetId,
                            onStart: () => {
                              void (async () => {
                                setActiveDashboardTargetId(e.targetId);
                                setDockerOp((prev) => ({ ...prev, [e.targetId]: "starting" }));
                                await apiFetch(`/api/docker/start`, { method: "POST" }, e.targetId);
                                await fetchDockerStatusFor(e.targetId);
                                setDockerOp((prev) => ({ ...prev, [e.targetId]: null }));
                              })();
                            },
                            onStop: () => {
                              void (async () => {
                                setActiveDashboardTargetId(e.targetId);
                                setDockerOp((prev) => ({ ...prev, [e.targetId]: "stopping" }));
                                await apiFetch(`/api/docker/stop`, { method: "POST" }, e.targetId);
                                // Compose down can take a moment; poll quickly so UI updates ASAP.
                                for (let i = 0; i < 8; i++) {
                                  await fetchDockerStatusFor(e.targetId);
                                  if (dockerRunning === false) break;
                                  await new Promise((r) => setTimeout(r, 650));
                                }
                                setDockerOp((prev) => ({ ...prev, [e.targetId]: null }));
                              })();
                            },
                            onRefresh: () => {
                              void (async () => {
                                setActiveDashboardTargetId(e.targetId);
                                setDockerOp((prev) => ({ ...prev, [e.targetId]: "refreshing" }));
                                await fetchDockerStatusFor(e.targetId);
                                setDockerOp((prev) => ({ ...prev, [e.targetId]: null }));
                              })();
                            },
                          })}
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>
              )}
            </Paper>
          }
        />
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Match landing page: only the top title strip is blue */}
      <AppBar position="static" elevation={0} sx={{ backgroundColor: "transparent" }}>
        <Toolbar
          sx={{
            position: "relative",
            justifyContent: "center",
            backgroundColor: "#1565c0",
            minHeight: 64,
          }}
        >
          <IconButton
            size="small"
            color="inherit"
            onClick={() => {
              stopEcho();
              stopPlot();
              stopCamera();
              stopModemEchos();
              stopMros();
              setPage("landing");
            }}
            aria-label="Back"
            sx={{ position: "absolute", left: 8 }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.8, textAlign: "center" }}>
            Marine Autonomous Vehicles Laboratory GUI
          </Typography>
        </Toolbar>
        {/* Vehicle dashboard tabs (yellow blocks) */}
        {connectedVehicles.length > 0 && (
          <Toolbar
            variant="dense"
            sx={{
              px: 1,
              py: 0.25,
              gap: 1,
              minHeight: 44,
              mt: 0.75,
              // Slightly different shade than header for separation
              backgroundColor: "rgba(13, 71, 161, 0.22)",
            }}
          >
            <Tabs
              value={activeDashboardTargetId ?? false}
              onChange={(_e, v) => setActiveDashboardTargetId(String(v))}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: 40,
                flex: 1,
                "& .MuiTab-root": {
                  textTransform: "none",
                  minHeight: 36,
                  px: 1,
                  borderRadius: 1,
                  mr: 1,
                  bgcolor: "rgba(2, 136, 209, 0.26)",
                  border: "1px solid rgba(2, 136, 209, 0.70)",
                  color: "#fff",
                },
                "& .MuiTab-root.Mui-selected": {
                  bgcolor: "rgba(2, 136, 209, 0.82)",
                  border: "1px solid rgba(2, 136, 209, 0.95)",
                  color: "#fff",
                },
                "& .MuiTabs-indicator": { display: "none" },
              }}
            >
              {openDashboards
                .map((id) => connectedVehicles.find((v) => v.targetId === id) ?? null)
                .filter(Boolean)
                .map((d) => (
                  <Tab
                    key={(d as any).targetId}
                    value={(d as any).targetId}
                    label={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {(d as any).label}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeDashboardTab((d as any).targetId);
                          }}
                          sx={{ color: "inherit", p: 0.25, opacity: 0.9 }}
                          aria-label="Close dashboard tab"
                        >
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    }
                  />
                ))}
            </Tabs>

            {topTab === 0 && (
              <Chip
                size="small"
                variant="outlined"
                color={rosbridgeReachable ? "success" : "error"}
                label={rosbridgeReachable ? "Rosbridge: reachable" : "Rosbridge: unreachable"}
              />
            )}
            <Chip
              size="small"
              variant="outlined"
              color={
                !status ? "default"
                  : !status.ok ? "error"
                  : status.sshTcpMs !== null && status.sshTcpMs < 80 ? "success"
                  : status.sshTcpMs !== null && status.sshTcpMs < 200 ? "warning"
                  : "error"
              }
              label={
                !status ? "Link: \u2014"
                  : !status.ok ? "Link: down"
                  : `Link: ${status.sshTcpMs ?? "\u2014"} ms`
              }
            />
          </Toolbar>
        )}
        <Tabs
          value={topTab}
          onChange={(_e, v) => setTopTab(v)}
          textColor="inherit"
          sx={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        >
          <Tab label="DASHBOARD" />
          <Tab
            icon={<img src="/terminator-icon.png" alt="" style={{ width: 20, height: 20 }} />}
            iconPosition="start"
            label="TERMINALS"
            sx={{ ml: "auto", minHeight: 0 }}
          />
        </Tabs>
      </AppBar>

      {false && (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            pt: { xs: 2, sm: 4 },
            pb: 2,
            px: 2,
            minHeight: 0,
            overflow: "auto",
            width: "100%",
          }}
        >
          <Paper
            sx={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: 1080,
              maxHeight: "calc(100vh - 140px)",
            }}
          >
            <Tabs
              value={connTab}
              onChange={(_e, v) => setConnTab(v)}
              sx={{
                flexShrink: 0,
                borderBottom: 1,
                borderColor: "divider",
                "& .MuiTabs-flexContainer": { justifyContent: "center" },
              }}
            >
              <Tab label="SSH" />
              <Tab label="Docker" />
            </Tabs>
            <Box
              sx={{
                p: 2.5,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                ...(connTab === 1
                  ? { overflow: "auto", maxHeight: "calc(100vh - 220px)" }
                  : {}),
              }}
            >
            {connTab === 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="h6">Connect to Vehicle</Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                size="small"
                label="User"
                value={jetsonUser}
                onChange={(e) => setJetsonUser(e.target.value)}
              />
              <TextField
                size="small"
                label="IP / Host"
                value={jetsonHost}
                onChange={(e) => setJetsonHost(e.target.value)}
                fullWidth
              />
              <TextField
                size="small"
                label="Port"
                value={jetsonPort}
                onChange={(e) => setJetsonPort(e.target.value)}
                sx={{ width: 120 }}
              />
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                size="small"
                label="Password"
                type={showJetsonPassword ? "text" : "password"}
                value={jetsonPassword}
                onChange={(e) => setJetsonPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => setShowJetsonPassword((v: boolean) => !v)}
                        aria-label={showJetsonPassword ? "Hide password" : "Show password"}
                      >
                        {showJetsonPassword ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                fullWidth
              />
              <TextField
                size="small"
                label="AUV Directory"
                value={jetsonAuvDir}
                onChange={(e) => setJetsonAuvDir(e.target.value)}
                fullWidth
              />
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="contained" disabled={!!busy} onClick={() => void connect()}>
                Connect
              </Button>
            </Box>
            {connected ? (
              <Alert severity="success">Connected successfully to &quot;{jetsonUser}&quot;.</Alert>
            ) : (
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Enter credentials and click Connect.
              </Typography>
            )}
            </Box>
            )}
            {connTab === 1 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {!connected ? (
                <Alert severity="warning">Connect to the vehicle first (SSH tab).</Alert>
              ) : (
                <>
                  {/* Compose container section */}
                  <Typography variant="h6">Compose Container</Typography>
                  {/* removed per UI request */}
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <Button variant="contained" color="success" disabled={!!busy || dockerRunning === true} onClick={startContainer}>
                      Start Container
                    </Button>
                    <Button variant="contained" color="error" disabled={!!busy || dockerRunning === false} onClick={stopContainer}>
                      Stop Container
                    </Button>
                    <Button variant="outlined" disabled={!!busy} onClick={fetchDockerStatus}>
                      Refresh
                    </Button>
                  </Box>
                  {dockerRunning === true && (
                    <Alert severity="success">Compose stack is running.</Alert>
                  )}
                  {dockerRunning === false && (
                    <Alert severity="info">Container is not running. Click Start to launch it.</Alert>
                  )}
                  {dockerRunning === null && (
                    <Alert severity="info">Click Refresh to check status.</Alert>
                  )}

                  <Divider sx={{ my: 1 }} />

                  {/* All running containers section */}
                  <Typography variant="h6">All Running Containers</Typography>
                  {allContainers.length === 0 ? (
                    <Typography variant="body2" sx={{ opacity: 0.5 }}>No running containers found. Click Refresh above.</Typography>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {allContainers.map((c) => (
                        <Paper key={c.id} variant="outlined" sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 2 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" sx={{ fontFamily: "monospace" }}>{c.name}</Typography>
                            <Typography variant="caption" sx={{ opacity: 0.6, display: "block" }}>{c.image}</Typography>
                            <Typography variant="caption" sx={{ opacity: 0.5, display: "block" }}>{c.status}</Typography>
                          </Box>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={!!busy}
                            onClick={() => killContainer(c.name)}
                          >
                            Kill &amp; Remove
                          </Button>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </>
              )}
            </Box>
            )}
            </Box>
          </Paper>
        </Box>
      )}
      {topTab === 0 && (
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.5, p: 2, overflow: "hidden" }}>
        {!activeDashboardTargetId && (
          <Alert severity="info">
            Open a dashboard from <b>Connected vehicles</b> on the landing page.
          </Alert>
        )}

        <Box sx={{ flex: 1, display: "flex", gap: 2, overflow: "hidden" }}>
        {/* Left panel (Sensors / Devices / …) */}
        <Paper sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Tabs value={leftTab} onChange={(_e, v) => setLeftTab(v)}>
            <Tab label="Devices" />
            <Tab label="Sensors" />
            <Tab label="Micro-ROS" />
            <Tab label="ROS Topics" />
            <Tab label="ROS Nodes" />
          </Tabs>
          <Divider />

          {leftTab === 0 ? (
            <Box sx={{ p: 2, display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                color="warning"
                disabled={!!busy}
                onClick={refreshUsbDevices}
              >
                List USB Devices
              </Button>
              <Button
                variant="contained"
                color="warning"
                disabled={!!busy}
                onClick={applyUdevRules}
              >
                Apply Udev Rules
              </Button>
            </Box>
          ) : leftTab === 1 ? (
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
              {!udevRulesApplied && (
                <Alert severity="warning">
                  It is recommended to apply udev rules before activating sensors. Open the Devices tab and Apply Udev
                  Rules.
                </Alert>
              )}
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={!!busy}
                  onClick={() => postJson("/api/sensors/activate")}
                  sx={{ flex: 1 }}
                >
                  Activate All
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={!!busy}
                  onClick={() => postJson("/api/sensors/deactivate")}
                  sx={{ flex: 1 }}
                >
                  Deactivate All
                </Button>
                <Button
                  variant="outlined"
                  disabled={!!busy}
                  onClick={() => {
                    void refreshTopics();
                    void refreshNodes();
                  }}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Refresh
                </Button>
              </Box>
              <Alert severity="info" sx={{ mt: 0.5 }}>
                To start all sensors at once, use the Activate / Deactivate buttons above. To run sensors
                separately, use the toggles below.
              </Alert>
            </Box>
          ) : leftTab === 2 ? (
            <Box sx={{ p: 2, display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                color="warning"
                disabled={!!busy}
                onClick={startMros}
              >
                Connect to Arduino using Micro ROS
              </Button>
              <Button variant="outlined" onClick={stopMros}>
                Stop
              </Button>
            </Box>
          ) : leftTab === 3 ? (
            <Box sx={{ p: 2, display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                disabled={!!busy}
                onClick={() => {
                  void refreshTopics();
                  void refreshNodes();
                }}
              >
                Refresh
              </Button>
              <TextField
                size="small"
                label="Filter"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                fullWidth
              />
            </Box>
          ) : (
            <Box sx={{ p: 2, display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                disabled={!!busy}
                onClick={() => {
                  void refreshTopics();
                  void refreshNodes();
                }}
              >
                Refresh
              </Button>
            </Box>
          )}

          <Divider />

          <Box sx={{ flex: 1, overflow: "auto" }}>
            {leftTab === 0
              ? (
                <Box>
                  {usbDevices.map((d) => (
                    <Box key={d} sx={{ px: 2, py: 1 }}>
                      <Typography variant="body2">{d}</Typography>
                    </Box>
                  ))}
                  {udevMap.length > 0 && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ px: 2, pb: 1 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Udev Symlink Mapping</Typography>
                        {udevMap.map((m) => (
                          <Box key={m.symlink} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5 }}>
                            <Chip
                              size="small"
                              label={m.status === "active" ? "ACTIVE" : "NOT FOUND"}
                              color={m.status === "active" ? "success" : "default"}
                              sx={{ width: 90, fontFamily: "monospace", fontSize: 11 }}
                            />
                            <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 13, minWidth: 130 }}>
                              {m.symlink}
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.5 }}>{"\u2192"}</Typography>
                            <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 13 }}>
                              {m.realDevice ?? "—"}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </>
                  )}
                </Box>
              )
              : leftTab === 1
              ? (
                <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={sensorStatusLoading}
                      onClick={() => void fetchSensorStatus(false)}
                    >
                      Refresh
                    </Button>
                  </Box>
                  {[
                    { id: "dvl", label: "DVL" },
                    { id: "sbg", label: "SBG IMU" },
                    { id: "ping2", label: "PING2" },
                    { id: "ping360", label: "PING360" },
                    { id: "frontcam", label: "FRONTCAM" },
                    { id: "bottomcam", label: "BOTTOMCAM" },
                    { id: "modem", label: "MODEM" },
                    { id: "bar30_ps", label: "BAR30" },
                  ].map((s) => {
                    const running = !!sensorRunning[s.id];
                    return (
                      <Box
                        key={s.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          py: 0.5,
                          borderBottom: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <FiberManualRecordIcon
                          sx={{
                            fontSize: 14,
                            color: running ? "success.main" : "error.main",
                            flexShrink: 0,
                          }}
                        />
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, fontFamily: "monospace", letterSpacing: 0.5 }}
                        >
                          {s.label}
                        </Typography>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          disabled={!!busy || sensorRowBusy === s.id}
                          onClick={() => postSensorAction(`/api/sensors/start/${s.id}`, s.id)}
                        >
                          Activate
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={!!busy || sensorRowBusy === s.id}
                          onClick={() => postSensorAction(`/api/sensors/stop/${s.id}`, s.id)}
                        >
                          Deactivate
                        </Button>
                      </Box>
                    );
                  })}
                </Box>
              )
              : leftTab === 2
              ? (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 2,
                      overflow: "auto",
                      fontSize: 12,
                      lineHeight: 1.35
                    }}
                  >
                    {mrosText || "Press “Connect to Arduino using Micro ROS” to start the agent.\n"}
                  </Box>
                )
              : leftTab === 3
              ? filteredTopics.map((t) => (
                  <Box
                    key={t}
                    sx={{
                      px: 2,
                      py: 1
                    }}
                  >
                    <Typography variant="body2">{t}</Typography>
                  </Box>
                ))
              : leftTab === 4
              ? nodes.map((n) => (
                  <Box
                    key={n}
                    sx={{
                      px: 2,
                      py: 1
                    }}
                  >
                    <Typography variant="body2">{n}</Typography>
                  </Box>
                ))
              : null}
          </Box>
        </Paper>

        {/* Right panel */}
        <Paper sx={{ flex: 2, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Tabs value={rightTab} onChange={(_e, v) => setRightTab(v)}>
            <Tab label="Echo" />
            <Tab label="Plot" />
            <Tab label="IMAGING" />
            <Tab label="SONARS" />
            <Tab label="Modem" />
            <Tab label="Record Data" />
          </Tabs>
          <Divider />

          {/* Main + resizable log split */}
          <Box
            ref={rightSplitRef}
            sx={{
              flex: 1,
              overflow: "hidden",
              display: "grid",
              gridTemplateRows: `${(1 - logFrac) * 100}% 6px ${logFrac * 100}%`
            }}
          >
            <Box sx={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {rightTab === 0 && (
              <>
                <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
                  <Autocomplete
                    options={topics}
                    value={echoTopic || null}
                    onChange={(_e, v) => setEchoTopic(v ?? "")}
                    freeSolo
                    fullWidth
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        label="Topic"
                        placeholder="Select a topic"
                      />
                    )}
                  />
                  <Button variant="contained" onClick={startEcho}>
                    Echo
                  </Button>
                  <Button variant="outlined" onClick={stopEcho}>
                    Stop
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => setEchoText("")}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Clear
                  </Button>
                </Box>
                <Divider />
                <Box
                  component="pre"
                  sx={{
                    flex: 1,
                    m: 0,
                    p: 2,
                    overflow: "auto",
                    fontSize: 12,
                    lineHeight: 1.35
                  }}
                >
                  {echoText}
                </Box>
              </>
            )}

          {rightTab === 1 && (
            <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
              <Autocomplete
                options={topics}
                value={plotTopic || null}
                onChange={(_e, v) => setPlotTopic(v ?? "")}
                freeSolo
                fullWidth
                renderInput={(params) => (
                  <TextField {...params} size="small" label="Topic (rate plot)" />
                )}
              />
              <Button variant="contained" onClick={startPlot}>
                Plot
              </Button>
              <Button variant="outlined" onClick={stopPlot}>
                Stop
              </Button>
            </Box>
          )}

          {rightTab === 2 && (
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
              <Alert severity="info">
                Imaging viewer supports <b>CompressedImage</b> (cameras) and raw <b>Image</b> (e.g.{" "}
                <code>/scan_image</code> from Ping360). Examples: <code>/front/image_raw/compressed</code>,{" "}
                <code>/bottom/image_raw/compressed</code>
              </Alert>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Autocomplete
                  options={topics.filter((t) => t.includes("compressed") || t.includes("scan_image") || t.includes("image"))}
                  value={camTopic || null}
                  onChange={(_e, v) => setCamTopic(v ?? "")}
                  freeSolo
                  fullWidth
                  renderInput={(params) => (
                    <TextField {...params} size="small" label="Topic (CompressedImage or Image)" />
                  )}
                />
                <Button variant="contained" onClick={startCamera}>
                  View
                </Button>
                <Button variant="outlined" onClick={stopCamera}>
                  Stop
                </Button>
              </Box>
              {camMsgType && (
                <Typography variant="body2" sx={{ opacity: 0.8, fontFamily: "monospace" }}>
                  type: {camMsgType}
                </Typography>
              )}
              {camErr && <Alert severity="error">{camErr}</Alert>}
              <Box
                sx={{
                  flex: 1,
                  minHeight: 320,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "rgba(255,255,255,0.04)",
                  borderRadius: 1,
                  overflow: "hidden"
                }}
              >
                {camImgUrl ? (
                  <img
                    src={camImgUrl}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>
                    No frame yet.
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          {rightTab === 3 && (
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
              <Button
                variant="contained"
                disabled={!!busy}
                onClick={startDvlTunnel}
                sx={{
                  width: "fit-content",
                  bgcolor: "#ffeb3b",
                  color: "rgba(0,0,0,0.87)",
                  "&:hover": { bgcolor: "#fdd835" }
                }}
              >
                VIEW DVL GUI
              </Button>
              {dvlUrl ? (
                <Alert severity="success">
                  You can view the DVL GUI at{" "}
                  <Link href={dvlUrl} target="_blank" rel="noreferrer">
                    {dvlUrl}
                  </Link>
                </Alert>
              ) : (
                <Alert severity="info">
                  Press “VIEW DVL GUI” to expose the DVL UI on <b>http://localhost:8080</b>.
                </Alert>
              )}
            </Box>
          )}

          {rightTab === 4 && (
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <TextField
                  size="small"
                  label="Send (max 8 chars)"
                  value={modemText}
                  inputProps={{ maxLength: 8 }}
                  onChange={(e) => setModemText(e.target.value)}
                  fullWidth
                />
                <Button variant="contained" color="warning" disabled={!!busy} onClick={sendModem}>
                  Send
                </Button>
              </Box>

              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  variant="outlined"
                  disabled={!!busy}
                  onClick={() => {
                    const available = topics.filter((t) => t.includes("/modem/"));
                    ensureModemEchos(available);
                  }}
                >
                  Attach modem topics
                </Button>
                <Typography variant="body2" sx={{ opacity: 0.75, alignSelf: "center" }}>
                  Echo stays open for up to 4 modem topics (auto-adapts as new topics appear).
                </Typography>
              </Box>

              <Paper sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <Tabs value={modemTab} onChange={(_e, v) => setModemTab(v)} variant="scrollable">
                  {modemTopics.length ? (
                    modemTopics.map((t) => <Tab key={t} label={t} />)
                  ) : (
                    <Tab label="No modem topics yet" disabled />
                  )}
                </Tabs>
                <Divider />
                <Box
                  component="pre"
                  sx={{
                    flex: 1,
                    m: 0,
                    p: 2,
                    overflow: "auto",
                    fontSize: 12,
                    lineHeight: 1.35
                  }}
                >
                  {modemTopics[modemTab] ? modemLogs[modemTopics[modemTab]] ?? "" : ""}
                </Box>
              </Paper>
            </Box>
          )}

          {rightTab === 5 && (
            <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
              {/* ── Left half: Record controls ── */}
              <Box sx={{ flex: 1, p: 2, display: "flex", flexDirection: "column", gap: 1, overflow: "auto", borderRight: 1, borderColor: "divider" }}>
                <Typography variant="h6">Record Data</Typography>

                {rosbagChecking ? (
                  <Alert severity="info">Checking for any running ros2 bag record...</Alert>
                ) : rosbagRecording ? (
                  <>
                    <Alert severity="warning">
                      <strong>Record already running.</strong> Click Stop to end the current recording.
                    </Alert>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button variant="contained" color="error" disabled={!!busy} onClick={stopRosbag}>
                        Stop Recording
                      </Button>
                      <Button variant="outlined" disabled={!!busy} onClick={fetchRosbagStatus}>
                        Refresh Status
                      </Button>
                    </Box>
                  </>
                ) : !rosbagSelecting ? (
                  <>
                    <Alert severity="info">No recording is running.</Alert>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button
                        variant="contained"
                        disabled={!!busy}
                        onClick={() => {
                          setRosbagSelecting(true);
                          setRosbagChecked({});
                        }}
                      >
                        Start a New Record
                      </Button>
                      <Button variant="outlined" disabled={!!busy} onClick={fetchRosbagStatus}>
                        Refresh Status
                      </Button>
                    </Box>
                  </>
                ) : (
                  <>
                    <Typography variant="subtitle2">Select topics to record:</Typography>
                    <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          topics.forEach((t) => {
                            all[t] = true;
                          });
                          setRosbagChecked(all);
                        }}
                      >
                        Select All
                      </Button>
                      <Button size="small" variant="outlined" onClick={() => setRosbagChecked({})}>
                        Deselect All
                      </Button>
                      <Box sx={{ flex: 1 }} />
                      <Button size="small" variant="text" disabled={!!busy} onClick={() => setRosbagSelecting(false)}>
                        Cancel
                      </Button>
                    </Box>
                    <Box sx={{ flex: 1, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, p: 1 }}>
                      {topics.length === 0 ? (
                        <Typography variant="body2" sx={{ opacity: 0.6 }}>
                          No topics available — fetch topics from the Devices tab first.
                        </Typography>
                      ) : (
                        topics.map((t) => (
                          <FormControlLabel
                            key={t}
                            sx={{ display: "flex", ml: 0, mr: 0 }}
                            control={
                              <Checkbox
                                size="small"
                                checked={!!rosbagChecked[t]}
                                onChange={(e) => setRosbagChecked((prev) => ({ ...prev, [t]: e.target.checked }))}
                              />
                            }
                            label={
                              <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                                {t}
                              </Typography>
                            }
                          />
                        ))
                      )}
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, pt: 1 }}>
                      <Button
                        variant="contained"
                        color="success"
                        disabled={!!busy || topics.filter((t) => rosbagChecked[t]).length === 0}
                        onClick={startRosbag}
                      >
                        Start Recording
                      </Button>
                    </Box>
                  </>
                )}
              </Box>

              {/* ── Right half: Previous Records ── */}
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <Box sx={{ px: 2, pt: 2, pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="h6" sx={{ flex: 1 }}>Previous Records</Typography>
                  <Button size="small" variant="outlined" disabled={rosbagRunsLoading} onClick={fetchRosbagRuns}>
                    Refresh
                  </Button>
                </Box>

                {selectedRun ? (
                  <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", px: 2, pb: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontFamily: "monospace", flex: 1 }}>
                        {selectedRun}/metadata.yaml
                      </Typography>
                      <IconButton size="small" onClick={() => { setSelectedRun(null); setSelectedRunMetadata(""); }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <Box
                      sx={{
                        flex: 1,
                        overflow: "auto",
                        borderRadius: 1,
                        "& pre": { margin: "0 !important", minHeight: "100%" },
                      }}
                    >
                      {metadataLoading ? (
                        <Typography variant="body2" sx={{ opacity: 0.6, p: 1.5 }}>Loading metadata...</Typography>
                      ) : (
                        <SyntaxHighlighter
                          language="yaml"
                          style={vscDarkPlus}
                          showLineNumbers
                          wrapLongLines
                          customStyle={{ fontSize: 12, borderRadius: 4 }}
                        >
                          {selectedRunMetadata}
                        </SyntaxHighlighter>
                      )}
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ flex: 1, overflow: "auto", px: 2, pb: 2 }}>
                    {rosbagRunsLoading ? (
                      <Typography variant="body2" sx={{ opacity: 0.6 }}>Loading runs...</Typography>
                    ) : rosbagRuns.length === 0 ? (
                      <Typography variant="body2" sx={{ opacity: 0.6 }}>No previous recordings found.</Typography>
                    ) : (
                      rosbagRuns.map((run) => (
                        <Box
                          key={run}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 1.5,
                            py: 0.5,
                            mb: 0.5,
                            borderRadius: 1,
                            border: 1,
                            borderColor: "divider",
                            "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: "monospace", fontSize: 13, flex: 1, cursor: "pointer" }}
                            onClick={() => fetchRunMetadata(run)}
                          >
                            📁 {run}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); deleteRosbagRun(run); }}
                            sx={{ color: "error.main", opacity: 0.7, "&:hover": { opacity: 1 } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
            </Box>

            {/* Drag handle */}
            <Box
              onMouseDown={onStartDrag}
              sx={{
                cursor: "row-resize",
                bgcolor: "rgba(255,255,255,0.08)",
                "&:hover": { bgcolor: "rgba(255,255,255,0.16)" }
              }}
            />

            {/* Bottom log panel */}
            <Box sx={{ minHeight: 160, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Tabs value={bottomTab} onChange={(_e, v) => setBottomTab(v)}>
                  <Tab label="Log" />
                </Tabs>
                <Box sx={{ flex: 1 }} />
                <Button
                  variant="text"
                  onClick={() => setLogText("")}
                  sx={{ mr: 1, whiteSpace: "nowrap" }}
                >
                  Clear log
                </Button>
              </Box>
              <Divider />
              <Box
                component="pre"
                sx={{
                  flex: 1,
                  m: 0,
                  p: 2,
                  overflow: "auto",
                  fontSize: 12,
                  lineHeight: 1.35,
                  opacity: 0.9
                }}
              >
                {logText}
              </Box>
            </Box>
          </Box>
        </Paper>
        </Box>
      </Box>
      )}
      {/* Terminals are always mounted so WS connections + history survive tab switches */}
      <TerminalSplitPane visible={topTab === 1} mounted={termsMounted} wsBase={wsBase} targetId={currentTargetId} />
    </Box>
  );
}

