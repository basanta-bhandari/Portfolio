#!/bin/sh
# Download a verified, prebuilt Tether backend and open public chat.
set -eu
umask 077
TETHER_CHAT_ORIGIN=${TETHER_CHAT_ORIGIN:-https://www.basanta.cc}
case "$TETHER_CHAT_ORIGIN" in https://*) ;; *) echo 'The download origin must use HTTPS.' >&2; exit 1;; esac
for tether_command in curl awk uname; do
  command -v "$tether_command" >/dev/null 2>&1 || { echo "Required command is missing: $tether_command" >&2; exit 1; }
done
tether_system=$(uname -s)
tether_arch=$(uname -m)
case "$tether_system:$tether_arch" in
  Linux:x86_64|Linux:amd64) tether_platform=linux-x86_64;;
  Darwin:arm64|Darwin:aarch64) tether_platform=macos-arm64;;
  *) echo 'Available packages support x86-64 Linux, Apple Silicon macOS, and Windows.' >&2; exit 1;;
esac
if command -v sha256sum >/dev/null 2>&1; then
  tether_hash() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  tether_hash() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo 'SHA-256 verification requires sha256sum or shasum.' >&2; exit 1
fi
tether_fetch() {
  curl --fail --location --silent --show-error --retry 2 --connect-timeout 15 --max-time 300 \
    --proto '=https' --proto-redir '=https' --tlsv1.2 "$@"
}
tether_version=$(tether_fetch "$TETHER_CHAT_ORIGIN/chat/backend-version.txt")
if ! printf '%s\n' "$tether_version" | awk '/^[0-9]+\.[0-9]+\.[0-9]+$/ {ok=1} END {exit !ok}'; then
  echo 'The backend version could not be verified. Please retry later.' >&2; exit 1
fi
tether_artifact="neonet-backend-$tether_platform-v$tether_version"
tether_expected=$(tether_fetch "$TETHER_CHAT_ORIGIN/chat/backend-sha256.txt" | awk -v file="$tether_artifact" '$2==file {print $1;exit}')
case "$tether_expected" in ''|*[!0-9a-fA-F]*) echo 'This platform package is not available yet.' >&2; exit 1;; esac
[ "${#tether_expected}" -eq 64 ] || { echo 'Invalid backend checksum.' >&2; exit 1; }
tether_directory="${XDG_DATA_HOME:-$HOME/.local/share}/tether/backend/$tether_version"
mkdir -p "$tether_directory"
tether_binary="$tether_directory/neonet"
[ ! -L "$tether_binary" ] || { echo 'Refusing to replace a symbolic-link executable.' >&2; exit 1; }
if [ ! -f "$tether_binary" ] || [ "$(tether_hash "$tether_binary")" != "$tether_expected" ]; then
  tether_temporary=$(mktemp "$tether_directory/.download.XXXXXX")
  trap 'rm -f "$tether_temporary"' EXIT HUP INT TERM
  echo "Downloading Tether $tether_version for $tether_platform..."
  tether_fetch "$TETHER_CHAT_ORIGIN/tether/downloads/backend/$tether_artifact" --output "$tether_temporary"
  [ "$(tether_hash "$tether_temporary")" = "$tether_expected" ] || { echo 'Download verification failed. Nothing was installed.' >&2; exit 1; }
  chmod 700 "$tether_temporary"
  mv -f "$tether_temporary" "$tether_binary"
  trap - EXIT HUP INT TERM
fi
chmod 700 "$tether_binary"
echo 'Starting chat. Keep this terminal open; Ctrl-C disconnects and locks this session.'
if [ -t 0 ]; then
  exec "$tether_binary" web-chat "$@"
elif [ -r /dev/tty ]; then
  exec "$tether_binary" web-chat "$@" </dev/tty
else
  echo "No interactive terminal is available. Run $tether_binary web-chat in a terminal." >&2
  exit 1
fi
