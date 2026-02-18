# Battery Charge Limit — Redmi Book Pro 16 2024

Limits battery charging to **80%** on the **Redmi Book Pro 16 2024** (model TM2309) under Linux, using the laptop's own EC firmware via ACPI/WMI calls.

Tested on Ubuntu 25.10 with kernel 6.17. Should work on any distribution with kernel ≥ 5.x.

> **Note for 2025 model owners:** The [ArchWiki script](https://wiki.archlinux.org/title/Xiaomi_RedmiBook_Pro_16_2025) for the 2025 model uses the same ACPI path but a broken enable sequence. This repository's script works correctly on both models.

---

## How it works

The laptop's Embedded Controller (EC) exposes a "Long Life" mode bit (`LONL`) in its shared memory region. When this bit is set, the EC firmware stops charging at 80%.

The bit is controlled via an ACPI WMI method (`\_SB.PC00.WMID.WMAA`) — the same interface used by [MI Control](https://github.com/loginsinex/micontrol) on Windows.

**Critical detail:** the EC only reacts to a **0→1 transition**, not a static write. You must always clear the bit first, wait 50 ms, then set it. Simply writing 1 without clearing first does not work. This is the reason the [2025 model script](https://wiki.archlinux.org/title/Xiaomi_RedmiBook_Pro_16_2025) fails on the 2024 model — it skips the disable step.

Additionally, the EC resets the bit when the charger is plugged in, so the limit must be re-applied via a udev rule on every AC connect event.

---

## Files

| File | Purpose |
|---|---|
| `set_charge_limit.sh` | Main script — enable / disable / status |
| `charge-limit.service` | systemd service — applies limit on every boot |
| `charge-limit-ac.rules` | udev rule — re-applies limit when charger is plugged in |

---

## Requirements

- `acpi_call` kernel module (DKMS package)

```bash
# Debian / Ubuntu
sudo apt install acpi-call-dkms

# Arch Linux
sudo pacman -S acpi_call-dkms

# Fedora
sudo dnf install acpi_call
```

Verify it loaded:

```bash
lsmod | grep acpi_call
ls /proc/acpi/call
```

---

## Installation

### 1. Get the files

Clone the repository:

```bash
git clone https://github.com/toshka/redmi-charge-limiter.git
cd redmi-charge-limiter
```

Or download and extract the archive:

```bash
wget https://github.com/toshka/redmi-charge-limiter/archive/refs/heads/main.tar.gz
tar -xzf main.tar.gz
cd redmi-charge-limiter-main
```

### 2. Review the script

Before copying anything to system directories, read the script and make sure you are comfortable with what it does:

```bash
cat set_charge_limit.sh
```

It writes to `/proc/acpi/call` (requires root) and reads from `/sys/class/power_supply/BAT0/`. No network access, no persistent daemons, no files modified outside of what the install steps below explicitly describe.

### 3. Test it locally first

Run it directly from the cloned directory — no installation needed at this point:

```bash
sudo bash set_charge_limit.sh enable
sudo bash set_charge_limit.sh status   # should print: ENABLED (80% limit active)
```

Plug in the charger and monitor:

```bash
watch -n 5 'cat /sys/class/power_supply/BAT0/capacity /sys/class/power_supply/BAT0/status'
```

Charging should stop at 80%. Once confirmed, proceed with the permanent installation below.

### 4. Install the script

```bash
sudo cp set_charge_limit.sh /usr/local/bin/set_charge_limit.sh
sudo chmod +x /usr/local/bin/set_charge_limit.sh
```

### 5. Apply on boot (systemd service)

```bash
sudo cp charge-limit.service /etc/systemd/system/charge-limit.service
sudo systemctl daemon-reload
sudo systemctl enable --now charge-limit.service
```

### 6. Re-apply when charger is plugged in (udev rule)

```bash
sudo cp charge-limit-ac.rules /etc/udev/rules.d/99-charge-limit.rules
sudo udevadm control --reload
```

---

## Usage

```bash
sudo set_charge_limit.sh enable    # engage 80% charge limit
sudo set_charge_limit.sh disable   # remove limit (full charge)
sudo set_charge_limit.sh status    # read current state from EC
```

---

## Troubleshooting

**`/proc/acpi/call` not found**
The `acpi_call` module is not loaded. Install it (see Requirements) and run `sudo modprobe acpi_call`.

**`status` always shows DISABLED after reboot**
Make sure the systemd service is enabled: `sudo systemctl enable charge-limit.service`.

**Charging goes past 80% after plugging in the charger**
Make sure the udev rule is installed (step 4). The EC resets the limit on every charger connect event.

**Works after manual run but not on boot**
The `acpi_call` module may not be loaded early enough. Add it to `/etc/modules`:
```bash
echo acpi_call | sudo tee -a /etc/modules
```

---

## Compatibility

| Model | Status |
|---|---|
| Redmi Book Pro 16 2024 (TM2309) | Tested and working |
| Redmi Book Pro 16 2025 | Likely works (same ACPI path) |
| Redmi Book Pro 14 2024 | Untested — same EC interface likely present |

---

## License

GPL v3 — see [LICENSE](LICENSE) for full text.

This project is derived from reverse-engineering [MI Control](https://github.com/loginsinex/micontrol) (GPL v3) and depends on the [acpi_call](https://github.com/nix-community/acpi_call) kernel module (GPL). Derivative works must be released under GPL v3 as well.
