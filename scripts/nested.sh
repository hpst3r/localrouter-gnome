#!/usr/bin/env bash
# Throwaway nested GNOME Shell (in a window) with only this extension enabled.
# Uses a separate dconf db (~/.config/dconf/localrouter-nested), compiled
# offline, so your real session's enabled-extensions/prefs are never touched.
set -euo pipefail
UUID=localrouter@wporter.org
RUN="${XDG_RUNTIME_DIR:-/tmp}/localrouter-nested"
DB="${XDG_CONFIG_HOME:-$HOME/.config}/dconf/localrouter-nested"
mkdir -p "$RUN/keyfiles" "$(dirname "$DB")"

cat > "$RUN/keyfiles/00-nested" <<EOF
[org/gnome/shell]
disable-user-extensions=false
enabled-extensions=['$UUID']
welcome-dialog-last-shown-version='999'
EOF
# Recompiled each run: resets nested state; extension prefs changed inside
# the nested shell last only for that run.
dconf compile "$DB" "$RUN/keyfiles"
printf 'user-db:localrouter-nested\n' > "$RUN/profile"

export DCONF_PROFILE="$RUN/profile"
export MUTTER_DEBUG_DUMMY_MODE_SPECS="${NESTED_SIZE:-1600x1000}"
exec dbus-run-session -- gnome-shell --devkit --wayland
