import { Box, Paper, Typography } from "@mui/material";
import React from "react";
import type { VesselKey, VesselProfile } from "../components/VesselConnectCard";
import { VesselConnectCard } from "../components/VesselConnectCard";

export function Landing(props: {
  auv: VesselProfile;
  asv: VesselProfile;
  busy?: boolean;
  auvErrorText?: string | null;
  asvErrorText?: string | null;
  rightPane?: React.ReactNode;
  onChange: (vessel: VesselKey, next: VesselProfile) => void;
  onConnect: (vessel: VesselKey) => void;
  onOpenDashboard?: (vessel: VesselKey) => void;
  onDisconnect?: (vessel: VesselKey) => void;
}) {
  const {
    auv,
    asv,
    busy,
    auvErrorText,
    asvErrorText,
    rightPane,
    onChange,
    onConnect,
    onOpenDashboard,
    onDisconnect,
  } = props;

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        pt: { xs: 2, sm: 4 },
        pb: 2,
        px: 2,
        minHeight: 0,
        overflow: "auto",
        width: "100%",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: "100%",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: { xs: 2, md: 3 },
          alignItems: "start",
          justifyItems: "start",
        }}
      >
        {/* Left half: AUV + ASV stacked */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 2, md: 3 }, width: "100%" }}>
          <Paper
            variant="outlined"
            sx={{
              width: "100%",
              p: { xs: 2.25, md: 3 },
              backgroundColor: "rgba(21, 101, 192, 0.06)",
              borderColor: "rgba(21, 101, 192, 0.55)",
            }}
          >
            <VesselConnectCard
              title="AUV"
              value={auv}
              busy={busy}
              errorText={auvErrorText ?? null}
              onChange={(next) => onChange("AUV", next)}
              onConnect={() => onConnect("AUV")}
              onOpenDashboard={onOpenDashboard ? () => onOpenDashboard("AUV") : undefined}
              onDisconnect={onDisconnect ? () => onDisconnect("AUV") : undefined}
            />
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              width: "100%",
              p: { xs: 2.25, md: 3 },
              backgroundColor: "rgba(21, 101, 192, 0.06)",
              borderColor: "rgba(21, 101, 192, 0.55)",
            }}
          >
            <VesselConnectCard
              title="ASV"
              value={asv}
              busy={busy}
              errorText={asvErrorText ?? null}
              onChange={(next) => onChange("ASV", next)}
              onConnect={() => onConnect("ASV")}
              onOpenDashboard={onOpenDashboard ? () => onOpenDashboard("ASV") : undefined}
              onDisconnect={onDisconnect ? () => onDisconnect("ASV") : undefined}
            />
          </Paper>
        </Box>

        {/* Right half: connected vehicles list */}
        <Box sx={{ display: { xs: "none", md: "block" }, width: "100%" }}>
          {rightPane ?? null}
        </Box>
      </Box>
    </Box>
  );
}

