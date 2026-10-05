import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {ControlClient} from './lib/client.js';
import {buildView, panelSummary, pct, formatTokens} from './lib/model.js';

const BAR_WIDTH = 140;

// Horizontal remaining-quota bar with a reserve marker.
const QuotaBar = GObject.registerClass(
class QuotaBar extends St.Widget {
    _init() {
        super._init({
            style_class: 'lr-bar',
            layout_manager: new Clutter.FixedLayout(),
            width: BAR_WIDTH,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._fill = new St.Widget({style_class: 'lr-bar-fill'});
        this._marker = new St.Widget({style_class: 'lr-bar-reserve'});
        this.add_child(this._fill);
        this.add_child(this._marker);
    }

    update(w) {
        const height = 8;
        this._fill.set_size(Math.round(BAR_WIDTH * w.remaining), height);
        this._fill.style_class = `lr-bar-fill ${w.belowReserve ? 'lr-crit' : w.remaining < 0.25 ? 'lr-warn' : 'lr-ok'}`;
        this._marker.visible = w.reserve > 0;
        this._marker.set_position(Math.round(BAR_WIDTH * w.reserve), 0);
        this._marker.set_size(2, height);
    }
});

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(ext) {
        super._init(0.5, 'LocalRouter');
        this._ext = ext;
        this._settings = ext.getSettings();
        this._client = new ControlClient();
        this._cancellable = null;
        this._timer = 0;
        this._lastView = null;

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({icon_name: 'network-server-symbolic', style_class: 'system-status-icon'});
        this._label = new St.Label({text: '…', y_align: Clutter.ActorAlign.CENTER, style_class: 'lr-panel-label'});
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this._accountsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._accountsSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._statusItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._statusItem);
        this.menu.addAction('Refresh', () => this._refresh());
        this.menu.addAction('Open dashboard', () => {
            Gio.AppInfo.launch_default_for_uri(this._settings.get_string('server-url'), null);
        });
        this.menu.addAction('Settings', () => ext.openPreferences());

        this._settingsIds = [
            this._settings.connect('changed::poll-interval', () => this._schedule()),
            this._settings.connect('changed::server-url', () => this._refresh()),
            this._settings.connect('changed::key-file', () => this._refresh()),
            this._settings.connect('changed::panel-account', () => this._render()),
        ];
        // Countdowns go stale while the menu is closed; re-render on open.
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._refresh();
        });

        this._schedule();
        this._refresh();
    }

    _schedule() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            this._settings.get_uint('poll-interval'), () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            });
    }

    async _refresh() {
        this._cancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        try {
            const {status, usage} = await this._client.fetchAll(this._settings, cancellable);
            this._lastView = buildView(status, usage);
            this._error = null;
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            this._error = e.message;
        }
        if (this._cancellable === cancellable)
            this._render();
    }

    _render() {
        const view = this._lastView;
        if (this._error) {
            this._label.text = view ? panelSummary(view.accounts, this._settings.get_string('panel-account')).text : '—';
            this._setState('err');
            this._statusItem.label.text = `Unreachable: ${this._error}`;
            this._statusItem.visible = true;
        } else {
            this._statusItem.visible = false;
        }
        if (!view)
            return;

        if (!this._error) {
            const p = panelSummary(view.accounts, this._settings.get_string('panel-account'));
            this._label.text = p.text;
            this._setState(p.state);
        }

        this._accountsSection.removeAll();
        for (const a of view.accounts)
            this._accountsSection.addMenuItem(this._accountItem(a));
    }

    _setState(state) {
        for (const s of ['ok', 'warn', 'crit', 'err'])
            this._label.remove_style_class_name(`lr-${s}`);
        this._label.add_style_class_name(`lr-${state}`);
    }

    _accountItem(a) {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, style_class: 'lr-account'});
        const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        item.add_child(col);

        const head = new St.BoxLayout();
        head.add_child(new St.Label({text: a.id, style_class: 'lr-account-name', x_expand: true}));
        const flags = [];
        if (!a.healthy)
            flags.push(a.error ? 'error' : 'cooldown');
        if (a.stale)
            flags.push('stale');
        flags.push(a.backgroundOk ? 'bg ✓' : 'bg ✗');
        head.add_child(new St.Label({text: flags.join(' · '), style_class: 'lr-account-flags'}));
        col.add_child(head);

        for (const w of a.windows) {
            const row = new St.BoxLayout({style_class: 'lr-window-row'});
            row.add_child(new St.Label({text: w.label, style_class: 'lr-window-label', y_align: Clutter.ActorAlign.CENTER}));
            const bar = new QuotaBar();
            bar.update(w);
            row.add_child(bar);
            row.add_child(new St.Label({
                text: `${pct(w.remaining)}${w.countdown ? `  ↻ ${w.countdown}` : ''}`,
                style_class: 'lr-window-detail', y_align: Clutter.ActorAlign.CENTER,
            }));
            col.add_child(row);
        }

        if (a.usage) {
            const u = a.usage;
            col.add_child(new St.Label({
                text: `24h: ${u.requests} req · ${formatTokens(u.input)} in / ${formatTokens(u.output)} out${u.cost ? ` · ${u.cost}` : ''}`,
                style_class: 'lr-usage',
            }));
        }
        if (a.error || (!a.backgroundOk && a.reason)) {
            col.add_child(new St.Label({text: a.error ?? a.reason, style_class: 'lr-reason'}));
        }
        return item;
    }

    destroy() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        this._cancellable?.cancel();
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._client.destroy();
        this._settings = null;
        super.destroy();
    }
});

export default class LocalRouterExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
