// Run: gjs -m tests/model_test.js
import {buildView, formatCountdown, formatCost, panelSummary} from '../localrouter@wporter.org/lib/model.js';

let failed = 0;
function eq(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) {
        failed++;
        print(`FAIL ${name}: got ${g} want ${w}`);
    } else {
        print(`ok   ${name}`);
    }
}

const now = new Date('2026-10-05T20:00:00Z');
eq('countdown h/m', formatCountdown('2026-10-05T22:58:30Z', now), '2h 58m');
eq('countdown days', formatCountdown('2026-10-09T20:00:00Z', now), '4d 0h');
eq('countdown past', formatCountdown('2026-10-05T19:00:00Z', now), 'now');
eq('countdown null', formatCountdown(null, now), '');
eq('countdown <1m', formatCountdown('2026-10-05T20:00:20Z', now), '1m');
eq('cost labeled estimate', formatCost(14.1669), '~$14.17 est.');
eq('cost null', formatCost(null), '');

const status = {accounts: [
    {id: 'codex-primary', provider: 'codex', healthy: false, windows: [], reserve: {'5h': 0.1}, stale: true,
        error: 'usage api: credential unavailable', background_admissible: false},
    {id: 'claude-max', provider: 'claude', healthy: true, reserve: {'5h': 0.1, weekly: 0.1},
        background_admissible: true, interactive_admissible: true, windows: [
            {kind: '5h', remaining_frac: 0.89, reset_at: '2026-10-05T23:00:00Z', rolled: false},
            {kind: 'weekly_fable', remaining_frac: 1, reset_at: null, rolled: false},
        ]},
    {id: 'ollama-cloud', provider: 'ollama', healthy: true, reserve: {'5h': 0.1},
        background_admissible: false, windows: [
            {kind: '5h', remaining_frac: 0.08, reset_at: null, rolled: false},
        ]},
]};
const usage = {rows: [{key: 'claude-max', requests: 3, input_tokens: 1500, output_tokens: 20, cost_usd: 0.5}]};
const v = buildView(status, usage, now);

eq('accounts kept', v.accounts.map(a => a.id), ['codex-primary', 'claude-max', 'ollama-cloud']);
eq('weekly_* inherits weekly reserve', v.accounts[1].windows[1].reserve, 0.1);
eq('weekly_* label', v.accounts[1].windows[1].label, 'Wk fable');
eq('below reserve flagged', v.accounts[2].windows[0].belowReserve, true);
eq('usage joined', v.accounts[1].usage.cost, '~$0.50 est.');
eq('no usage row -> null', v.accounts[0].usage, null);
eq('panel picks tightest 5h', v.panel, {text: '8%', state: 'crit', account: 'ollama-cloud'});
eq('panel pinned', panelSummary(v.accounts, 'claude-max'), {text: '89%', state: 'ok', account: 'claude-max'});
eq('panel unknown pin falls back', panelSummary(v.accounts, 'nope').account, 'ollama-cloud');
eq('rolled window = full', buildView({accounts: [{id: 'x', windows: [{kind: '5h', remaining_frac: 0.1, rolled: true}]}]}, null).accounts[0].windows[0].remaining, 1);
eq('no windows -> LR', panelSummary(buildView({accounts: [{id: 'c', healthy: false, windows: []}]}, null).accounts), {text: 'LR', state: 'warn', account: null});
eq('empty status', buildView(null, null).accounts, []);

if (failed) {
    print(`${failed} failed`);
    (await import("system")).default.exit(1);
}
print('all passed');
