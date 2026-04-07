import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  TextField,
  Typography,
  IconButton,
  InputAdornment,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useState } from "react";

export type VesselKey = "AUV" | "ASV";

export type VesselProfile = {
  user: string;
  host: string;
  port: string;
  password: string;
  auvDir: string;
};

export function VesselConnectCard(props: {
  title: VesselKey;
  value: VesselProfile;
  disabled?: boolean;
  busy?: boolean;
  connectedLabel?: string | null;
  errorText?: string | null;
  onChange: (next: VesselProfile) => void;
  onConnect: () => void;
  onOpenDashboard?: () => void;
  onDisconnect?: () => void;
}) {
  const { title, value, disabled, busy, connectedLabel, errorText, onChange, onConnect, onOpenDashboard, onDisconnect } = props;
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 320 }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography variant="h6" sx={{ letterSpacing: 0.8 }}>
          {title}
        </Typography>
        <Divider />

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 110px", gap: 1 }}>
          <TextField
            size="small"
            label="User"
            value={value.user}
            disabled={disabled || !!busy}
            onChange={(e) => onChange({ ...value, user: e.target.value })}
          />
          <TextField
            size="small"
            label="IP / Host"
            value={value.host}
            disabled={disabled || !!busy}
            onChange={(e) => onChange({ ...value, host: e.target.value })}
          />
          <TextField
            size="small"
            label="Port"
            value={value.port}
            disabled={disabled || !!busy}
            onChange={(e) => onChange({ ...value, port: e.target.value })}
          />
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <TextField
            size="small"
            label="Password"
            type={showPassword ? "text" : "password"}
            value={value.password}
            disabled={disabled || !!busy}
            onChange={(e) => onChange({ ...value, password: e.target.value })}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowPassword((p) => !p)}
                    edge="end"
                    disabled={disabled || !!busy}
                  >
                    {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            size="small"
            label={title === "ASV" ? "ASV Directory" : "AUV Directory"}
            value={value.auvDir}
            disabled={disabled || !!busy}
            onChange={(e) => onChange({ ...value, auvDir: e.target.value })}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1, flexWrap: "wrap" }}>
          <Button variant="contained" disabled={disabled || !!busy} onClick={onConnect}>
            Connect
          </Button>
          {connectedLabel && onOpenDashboard && (
            <Button variant="outlined" disabled={disabled || !!busy} onClick={onOpenDashboard}>
              Open Dashboard
            </Button>
          )}
          {connectedLabel && onDisconnect && (
            <Button variant="outlined" color="error" disabled={disabled || !!busy} onClick={onDisconnect}>
              Disconnect
            </Button>
          )}
          {connectedLabel ? (
            <Alert severity="success" sx={{ py: 0.25 }}>
              Connected: <b>{connectedLabel}</b>
            </Alert>
          ) : (
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              Enter credentials and click Connect.
            </Typography>
          )}
        </Box>

        {!!errorText && (
          <Alert severity="error" sx={{ mt: 0.5 }}>
            {errorText}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

