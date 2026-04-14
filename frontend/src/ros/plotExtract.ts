/** Extract named numeric series from a rosbridge JSON message for live plotting. */

const MAX_AUTO_KEYS = 48;

function isVec3(o: unknown): o is { x: number; y: number; z: number } {
  return (
    typeof o === "object" &&
    o !== null &&
    typeof (o as { x: unknown }).x === "number" &&
    typeof (o as { y: unknown }).y === "number" &&
    typeof (o as { z: unknown }).z === "number"
  );
}

function isQuat(o: unknown): o is { x: number; y: number; z: number; w: number } {
  return (
    typeof o === "object" &&
    o !== null &&
    typeof (o as { w: unknown }).w === "number" &&
    isVec3(o)
  );
}

function collectNumericLeaves(
  obj: unknown,
  prefix: string,
  depth: number,
  out: Record<string, number>,
  maxKeys: number
): void {
  if (Object.keys(out).length >= maxKeys) return;
  if (depth > 10 || obj === null || obj === undefined) return;

  if (typeof obj === "number" && Number.isFinite(obj)) {
    const key = prefix || "value";
    if (!(key in out)) out[key] = obj;
    return;
  }

  if (typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      if (Object.keys(out).length >= maxKeys) return;
      collectNumericLeaves(v, `${prefix}[${i}]`, depth + 1, out, maxKeys);
    });
    return;
  }

  for (const [k, v] of Object.entries(obj)) {
    if (Object.keys(out).length >= maxKeys) return;
    if (k === "header") continue;
    const next = prefix ? `${prefix}.${k}` : k;
    collectNumericLeaves(v, next, depth + 1, out, maxKeys);
  }
}

function finalize(series: Record<string, number>): { series: Record<string, number>; keys: string[] } {
  const keys = Object.keys(series).sort();
  return { series, keys };
}

function pushVec3(prefix: string, v: unknown, series: Record<string, number>): void {
  if (!isVec3(v)) return;
  series[`${prefix}.x`] = v.x;
  series[`${prefix}.y`] = v.y;
  series[`${prefix}.z`] = v.z;
}

/**
 * Map ROS 2 message type (as returned by rosapi) + payload to plottable scalars.
 * Unknown/custom messages fall back to a bounded tree of numeric leaves.
 */
export function extractNumericSeries(
  msg: unknown,
  messageType: string
): { series: Record<string, number>; keys: string[] } {
  const series: Record<string, number> = {};
  const normalized = messageType.replace(/^([^/]+)\/msg\//, "$1/");
  const m = msg as Record<string, unknown>;

  const is = (pkgMsg: string) => normalized === pkgMsg || messageType.includes(pkgMsg.replace("/", "/msg/"));

  if (is("std_msgs/Float64") || messageType.includes("std_msgs/msg/Float64")) {
    const v = m?.data;
    if (typeof v === "number") series.data = v;
  } else if (is("std_msgs/Float32") || messageType.includes("std_msgs/msg/Float32")) {
    const v = m?.data;
    if (typeof v === "number") series.data = v;
  } else if (is("std_msgs/Int32") || messageType.includes("std_msgs/msg/Int32")) {
    const v = m?.data;
    if (typeof v === "number") series.data = v;
  } else if (is("std_msgs/Int64") || messageType.includes("std_msgs/msg/Int64")) {
    const v = m?.data;
    if (typeof v === "number") series.data = v;
  } else if (is("std_msgs/UInt32") || messageType.includes("std_msgs/msg/UInt32")) {
    const v = m?.data;
    if (typeof v === "number") series.data = v;
  } else if (is("sensor_msgs/Imu") || messageType.includes("sensor_msgs/msg/Imu")) {
    const ori = m?.orientation;
    if (isQuat(ori)) {
      series["ori.x"] = ori.x;
      series["ori.y"] = ori.y;
      series["ori.z"] = ori.z;
      series["ori.w"] = ori.w;
    }
    pushVec3("gyro", m?.angular_velocity, series);
    pushVec3("accel", m?.linear_acceleration, series);
  } else if (is("sensor_msgs/FluidPressure") || messageType.includes("sensor_msgs/msg/FluidPressure")) {
    const v = m?.fluid_pressure;
    if (typeof v === "number") series.pressure = v;
  } else if (is("sensor_msgs/Range") || messageType.includes("sensor_msgs/msg/Range")) {
    const v = m?.range;
    if (typeof v === "number") series.range = v;
  } else if (is("geometry_msgs/Twist") || messageType.includes("geometry_msgs/msg/Twist")) {
    pushVec3("linear", m?.linear, series);
    pushVec3("angular", m?.angular, series);
  } else if (is("geometry_msgs/TwistStamped") || messageType.includes("geometry_msgs/msg/TwistStamped")) {
    const twist = m?.twist as Record<string, unknown> | undefined;
    pushVec3("linear", twist?.linear, series);
    pushVec3("angular", twist?.angular, series);
  } else if (is("geometry_msgs/Vector3") || messageType.includes("geometry_msgs/msg/Vector3")) {
    pushVec3("v", m, series);
  } else if (is("geometry_msgs/Vector3Stamped") || messageType.includes("geometry_msgs/msg/Vector3Stamped")) {
    pushVec3("v", m?.vector, series);
  } else if (is("geometry_msgs/PoseStamped") || messageType.includes("geometry_msgs/msg/PoseStamped")) {
    const pose = m?.pose as Record<string, unknown> | undefined;
    pushVec3("pos", pose?.position, series);
    const ori = pose?.orientation;
    if (isQuat(ori)) {
      series["ori.x"] = ori.x;
      series["ori.y"] = ori.y;
      series["ori.z"] = ori.z;
      series["ori.w"] = ori.w;
    }
  } else if (
    is("geometry_msgs/PoseWithCovarianceStamped") ||
    messageType.includes("geometry_msgs/msg/PoseWithCovarianceStamped")
  ) {
    const pose = m?.pose as Record<string, unknown> | undefined;
    const inner = pose?.pose as Record<string, unknown> | undefined;
    pushVec3("pos", inner?.position, series);
    const ori = inner?.orientation;
    if (isQuat(ori)) {
      series["ori.x"] = ori.x;
      series["ori.y"] = ori.y;
      series["ori.z"] = ori.z;
      series["ori.w"] = ori.w;
    }
  } else if (is("nav_msgs/Odometry") || messageType.includes("nav_msgs/msg/Odometry")) {
    const pose = m?.pose as Record<string, unknown> | undefined;
    const pwc = pose?.pose as Record<string, unknown> | undefined;
    const pos = pwc?.position;
    pushVec3("pos", pos, series);
    const twist = m?.twist as Record<string, unknown> | undefined;
    const tw = twist?.twist as Record<string, unknown> | undefined;
    pushVec3("lin", tw?.linear, series);
    pushVec3("ang", tw?.angular, series);
  }

  if (Object.keys(series).length === 0) {
    collectNumericLeaves(msg, "", 0, series, MAX_AUTO_KEYS);
  }

  return finalize(series);
}
