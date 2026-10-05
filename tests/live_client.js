// Live smoke test against a running router (default http://127.0.0.1:8787).
// Run: gjs -m tests/live_client.js [url] [key-file]
import GLib from 'gi://GLib';
import {ControlClient} from '../localrouter@wporter.org/lib/client.js';
import {buildView} from '../localrouter@wporter.org/lib/model.js';
import System from 'system';

const [url = 'http://127.0.0.1:8787', keyFile = ''] = ARGV;
const settings = {
    get_string: k => ({'server-url': url, 'key-file': keyFile})[k],
};

const loop = new GLib.MainLoop(null, false);
let code = 0;
new ControlClient().fetchAll(settings, null).then(({status, usage}) => {
    const v = buildView(status, usage);
    print(JSON.stringify(v, null, 2));
    if (!v.accounts.length || !usage)
        code = 1;
}).catch(e => {
    print(`ERROR ${e.message}`);
    code = 2;
}).finally(() => loop.quit());
loop.run();
System.exit(code);
