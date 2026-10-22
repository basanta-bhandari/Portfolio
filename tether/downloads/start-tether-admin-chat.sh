#!/usr/bin/env bash
set -euo pipefail

readonly SITE_ORIGIN="https://www.basanta.cc"
readonly DOWNLOAD_ROOT="$SITE_ORIGIN/tether/downloads"
readonly INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/tether-admin-chat"
readonly BRIDGE_FILE="$INSTALL_ROOT/tether-web-bridge.py"
readonly TETHER_FILE="$INSTALL_ROOT/neonet-linux-x86_64-v0.5.2.AppImage"
readonly PID_FILE="$INSTALL_ROOT/bridge.pid"
readonly LOG_FILE="$INSTALL_ROOT/bridge.log"
readonly BRIDGE_SHA256="c41c618281cee5c31459b2f14f4c93b2bacd0f095d2640a331d21591c01a2158"
readonly TETHER_SHA256="bf6c78d97355d648c000b7c34e818407b689c9b0f23af314db94286ba713c890"

for command_name in curl python3 sha256sum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

umask 077
mkdir -p "$INSTALL_ROOT"

download_verified() {
  local url="$1"
  local destination="$2"
  local expected="$3"
  local temporary="$destination.download"
  local actual

  rm -f "$temporary"
  curl --fail --location --silent --show-error --retry 3 \
    --proto '=https' --tlsv1.2 "$url" --output "$temporary"
  actual="$(sha256sum "$temporary")"
  actual="${actual%% *}"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "$temporary"
    echo "Verification failed for $(basename "$destination")." >&2
    echo "Expected $expected but received $actual." >&2
    exit 1
  fi
  mv -f "$temporary" "$destination"
}

echo "Downloading and verifying the Tether admin-chat files..."
download_verified "$DOWNLOAD_ROOT/tether-web-bridge.py" "$BRIDGE_FILE" "$BRIDGE_SHA256"
download_verified "$DOWNLOAD_ROOT/neonet-linux-x86_64-v0.5.2.AppImage" "$TETHER_FILE" "$TETHER_SHA256"
chmod 700 "$BRIDGE_FILE" "$TETHER_FILE"

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    if tr '\0' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null | grep -Fq "$BRIDGE_FILE"; then
      kill "$old_pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$old_pid" 2>/dev/null || break
        sleep 0.1
      done
    fi
  fi
fi

bridge_token="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
bridge_port="$(python3 -c 'import socket; sock = socket.socket(); sock.bind(("127.0.0.1", 0)); print(sock.getsockname()[1]); sock.close()')"
: > "$LOG_FILE"
nohup env TETHER_BRIDGE_TOKEN="$bridge_token" \
  python3 -u "$BRIDGE_FILE" --neonet "$TETHER_FILE" --port "$bridge_port" \
  >>"$LOG_FILE" 2>&1 </dev/null &
bridge_pid=$!
printf '%s\n' "$bridge_pid" > "$PID_FILE"

bridge_ready=false
for _ in {1..15}; do
  if curl --fail --silent --max-time 5 \
      --header "Origin: $SITE_ORIGIN" \
      --header "X-Tether-Bridge-Token: $bridge_token" \
      "http://127.0.0.1:$bridge_port/v1/status" | grep -q '"bridgeVersion"'; then
    bridge_ready=true
    break
  fi
  kill -0 "$bridge_pid" 2>/dev/null || break
  sleep 0.4
done

if [[ "$bridge_ready" != true ]]; then
  kill "$bridge_pid" 2>/dev/null || true
  echo "Tether could not start. Details:" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

admin_url="$SITE_ORIGIN/admin/#tether-token=$bridge_token&tether-port=$bridge_port"
echo "Tether was downloaded, verified, and started successfully."
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$admin_url" >/dev/null 2>&1 &
  echo "Returning to the admin chat in your browser."
else
  echo "Open this address to connect: $admin_url"
fi
