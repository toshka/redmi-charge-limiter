#!/bin/bash
# Battery charge limit for Redmi Book Pro 16 2024
# Copyright (C) 2026  Anton Bazhanov
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
#
# Mirrors the exact sequence used by Xiaomi MI Control (micontrol) on Windows:
#   1. Always DISABLE first (write 0)
#   2. Wait 50ms
#   3. ENABLE (write 1) if requested
#
# The limit enforced by the EC firmware is fixed at 80%.
# Only on/off is supported — no arbitrary percentage.
#
# Usage:
#   set_charge_limit.sh enable    — engage 80% charge limit
#   set_charge_limit.sh disable   — remove charge limit (full charge)
#   set_charge_limit.sh status    — read current state from EC

WMAA='\\_SB.PC00.WMID.WMAA'

# Buffer format (32 bytes, little-endian word fields):
#   bytes[0:1] = op   (0xFB = write, 0xFA = read)
#   bytes[2:3] = cmd  (0x10 = charge protection)
#   bytes[4:5] = arg1 (0x02 = toggle bit)
#   bytes[6:7] = arg2 (0x00 = disable, 0x01 = enable)

wmi_put() {
    local arg2="$1"
    local buf="0x00 0xfb 0x00 0x10 0x02 0x00 ${arg2} 0x00 \
0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 \
0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 \
0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
    echo "${WMAA} 0x0 0x1 { ${buf} }" | tee /proc/acpi/call > /dev/null
    cat /proc/acpi/call
}

wmi_get() {
    local buf="0x00 0xfa 0x00 0x10 0x02 0x00 0x00 0x00 \
0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 \
0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 \
0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00"
    echo "${WMAA} 0x0 0x1 { ${buf} }" | tee /proc/acpi/call > /dev/null
    cat /proc/acpi/call
}

do_enable() {
    echo "Step 1: disable (clear LONL bit)"
    wmi_put 0x00

    echo "Step 2: wait 50ms"
    sleep 0.05

    echo "Step 3: enable (set LONL bit)"
    wmi_put 0x01
}

do_disable() {
    echo "Disabling charge limit"
    wmi_put 0x00
}

do_status() {
    echo "Reading charge limit state from EC..."
    result=$(wmi_get)
    echo "Raw result: $result"
    # result[6] (7th byte) of OutData = LONL bit 0
    # parse the hex byte at position 6 (0-indexed) from the buffer
    byte6=$(echo "$result" | grep -oP '0x[0-9a-fA-F]+' | sed -n '7p')
    if [ "$byte6" = "0x01" ] || [ "$byte6" = "0x1" ]; then
        echo "Status: ENABLED (80% limit active)"
    else
        echo "Status: DISABLED (full charge)"
    fi
}

case "$1" in
    enable)   do_enable ;;
    disable)  do_disable ;;
    status)   do_status ;;
    *)
        echo "Usage: $0 {enable|disable|status}"
        echo "  enable   — engage EC charge limit (80%)"
        echo "  disable  — remove charge limit"
        echo "  status   — read current state"
        exit 1
        ;;
esac
