import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class LocalRouterPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: 'Router'});
        page.add(group);

        const url = new Adw.EntryRow({title: 'Server URL'});
        settings.bind('server-url', url, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(url);

        const key = new Adw.EntryRow({title: 'Key file (empty = no auth)'});
        settings.bind('key-file', key, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(key);

        const poll = new Adw.SpinRow({
            title: 'Poll interval (seconds)',
            adjustment: new Gtk.Adjustment({lower: 5, upper: 3600, step_increment: 5}),
        });
        settings.bind('poll-interval', poll, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(poll);

        const display = new Adw.PreferencesGroup({title: 'Top bar'});
        page.add(display);
        const acct = new Adw.EntryRow({title: 'Account ID (empty = lowest 5h remaining)'});
        settings.bind('panel-account', acct, 'text', Gio.SettingsBindFlags.DEFAULT);
        display.add(acct);

        window.add(page);
    }
}
