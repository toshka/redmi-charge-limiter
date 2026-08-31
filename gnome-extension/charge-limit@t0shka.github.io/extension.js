/* Battery charge limit — GNOME Shell Quick Settings toggle
 * Copyright (C) 2026  Anton Bazhanov
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * The toggle never touches the EC directly — it only starts and stops
 * charge-limit.service, which runs set_charge_limit.sh as root.
 * The bundled polkit rule is what makes that password-less.
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const UNIT = 'charge-limit.service';
const SYSTEMCTL = 'systemctl';

/* Run argv, resolve to {ok, stdout, stderr}. Never rejects on a non-zero
 * exit status — `systemctl is-active` uses exit codes as data. */
function run(argv, cancellable) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(e);
            return;
        }
        proc.communicate_utf8_async(null, cancellable, (p, res) => {
            try {
                const [, stdout, stderr] = p.communicate_utf8_finish(res);
                resolve({ok: p.get_successful(), stdout: (stdout ?? '').trim(), stderr: (stderr ?? '').trim()});
            } catch (e) {
                reject(e);
            }
        });
    });
}

const ChargeLimitToggle = GObject.registerClass(
class ChargeLimitToggle extends QuickSettings.QuickToggle {
    _init() {
        super._init({
            title: _('Charge Limit'),
            subtitle: _('80%'),
            iconName: 'battery-good-symbolic',
            toggleMode: true,
        });

        this._cancellable = new Gio.Cancellable();
        // Set while we mirror external state into `checked`, so the
        // notify handler doesn't bounce it straight back to systemd.
        this._syncing = false;

        this._handlerId = this.connect('notify::checked', () => {
            if (this._syncing)
                return;
            this._apply(this.checked);
        });
    }

    async _apply(enable) {
        const verb = enable ? 'start' : 'stop';
        try {
            const {ok, stderr} = await run([SYSTEMCTL, verb, UNIT], this._cancellable);
            if (!ok) {
                console.warn(`charge-limit: systemctl ${verb} ${UNIT} failed: ${stderr}`);
                Main.notifyError(_('Charge Limit'), stderr || _('Failed to switch the charge limit.'));
            }
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.error(`charge-limit: ${e}`);
        }
        // Re-read rather than trusting the click: a denied polkit action or a
        // failed ACPI call must snap the pill back to reality.
        await this.refresh();
    }

    async refresh() {
        let active = false;
        try {
            const {stdout} = await run([SYSTEMCTL, 'is-active', UNIT], this._cancellable);
            active = stdout === 'active' || stdout === 'activating';
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            console.error(`charge-limit: ${e}`);
            return;
        }
        if (this.checked === active)
            return;
        this._syncing = true;
        this.checked = active;
        this._syncing = false;
    }

    destroy() {
        this._cancellable.cancel();
        if (this._handlerId) {
            this.disconnect(this._handlerId);
            this._handlerId = 0;
        }
        super.destroy();
    }
});

const ChargeLimitIndicator = GObject.registerClass(
class ChargeLimitIndicator extends QuickSettings.SystemIndicator {
    _init() {
        super._init();
        this._toggle = new ChargeLimitToggle();
        this.quickSettingsItems.push(this._toggle);
    }

    refresh() {
        this._toggle.refresh();
    }
});

export default class ChargeLimitExtension extends Extension {
    enable() {
        this._indicator = new ChargeLimitIndicator();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        // The unit can also be switched from a terminal, by the boot-time
        // enable, or by the AC udev rule — so re-read whenever the panel opens.
        this._menu = Main.panel.statusArea.quickSettings.menu;
        this._openId = this._menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this._indicator.refresh();
        });

        this._indicator.refresh();
    }

    disable() {
        if (this._openId) {
            this._menu.disconnect(this._openId);
            this._openId = 0;
        }
        this._menu = null;
        this._indicator?.quickSettingsItems.forEach(item => item.destroy());
        this._indicator?.destroy();
        this._indicator = null;
    }
}
