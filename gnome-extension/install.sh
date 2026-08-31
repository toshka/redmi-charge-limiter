#!/bin/bash
# Install the Battery Charge Limit Quick Settings toggle.
#
# Assumes set_charge_limit.sh, charge-limit.service and the udev rule are
# already installed (see the repository README).
set -euo pipefail

UUID="charge-limit@t0shka.github.io"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "Installing extension to ${DEST}"
mkdir -p "${DEST}"
cp "${SRC}/${UUID}/metadata.json" "${SRC}/${UUID}/extension.js" "${DEST}/"

echo "Installing polkit rule (needs root)"
sudo install -m 0644 "${SRC}/49-charge-limit.rules" /etc/polkit-1/rules.d/49-charge-limit.rules
sudo systemctl reload polkit

echo "Reinstalling charge-limit.service (picks up the new ExecStop)"
sudo install -m 0644 "${SRC}/../charge-limit.service" /etc/systemd/system/charge-limit.service
sudo systemctl daemon-reload

echo
echo "Done. Now:"
echo "  1. Log out and back in (Wayland cannot reload GNOME Shell in place)."
echo "  2. gnome-extensions enable ${UUID}"
