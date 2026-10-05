import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

export class ControlClient {
    constructor() {
        this._session = new Soup.Session({timeout: 10, user_agent: 'localrouter-gnome/0.1'});
    }

    destroy() {
        this._session.abort();
        this._session = null;
    }

    async _readKey(path, cancellable) {
        if (!path)
            return '';
        const file = Gio.File.new_for_path(path.replace(/^~(?=\/)/, GLib.get_home_dir()));
        const [bytes] = await file.load_contents_async(cancellable);
        return new TextDecoder().decode(bytes).trim();
    }

    async getJSON(baseUrl, path, keyFile, cancellable) {
        const msg = Soup.Message.new('GET', baseUrl.replace(/\/+$/, '') + path);
        if (!msg)
            throw new Error(`invalid server URL: ${baseUrl}`);
        const key = await this._readKey(keyFile, cancellable);
        if (key)
            msg.request_headers.append('Authorization', `Bearer ${key}`);
        msg.request_headers.append('Cache-Control', 'no-store');

        const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable);
        const status = msg.get_status();
        if (status === Soup.Status.UNAUTHORIZED || status === Soup.Status.FORBIDDEN)
            throw new Error(key ? `HTTP ${status}: key rejected` : `HTTP ${status}: router requires a key file`);
        if (status !== Soup.Status.OK)
            throw new Error(`HTTP ${status}`);
        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }

    async fetchAll(settings, cancellable) {
        const base = settings.get_string('server-url');
        const keyFile = settings.get_string('key-file');
        const status = await this.getJSON(base, '/control/v1/status', keyFile, cancellable);
        let usage = null;
        try {
            usage = await this.getJSON(base, '/control/v1/usage?since=24h&group=account', keyFile, cancellable);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                throw e;
            // status alone is still useful
        }
        return {status, usage};
    }
}
