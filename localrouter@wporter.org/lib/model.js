// Pure view-model logic: no GI imports, so it runs under plain `gjs -m` tests.
// Input shapes follow LocalRouter's "Control API" specification:
// https://github.com/hpst3r/localrouter/blob/master/docs/SPEC.md

export const WINDOW_LABELS = {
    '5h': '5h',
    'weekly': 'Week',
};

export function windowLabel(kind) {
    return WINDOW_LABELS[kind] ?? kind.replace(/^weekly_/, 'Wk ');
}

// "2h 58m", "3d 4h", "12m", "now". resetAt is an ISO string or null.
export function formatCountdown(resetAt, now) {
    if (!resetAt)
        return '';
    const ms = Date.parse(resetAt) - now.getTime();
    if (Number.isNaN(ms))
        return '';
    if (ms <= 0)
        return 'now';
    const mins = Math.floor(ms / 60000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0)
        return `${d}d ${h}h`;
    if (h > 0)
        return `${h}h ${m}m`;
    return `${Math.max(m, 1)}m`;
}

export function formatTokens(n) {
    if (n === null || n === undefined)
        return '?';
    if (n >= 1e9)
        return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6)
        return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3)
        return `${(n / 1e3).toFixed(1)}k`;
    return String(n);
}

// cost_usd is a list-price estimate, never an actual charge: label it so.
export function formatCost(usd) {
    if (usd === null || usd === undefined)
        return '';
    return `~$${usd.toFixed(2)} est.`;
}

export function pct(frac) {
    return `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
}

// Build everything the indicator renders from /status + /usage responses.
// usage may be null (usage fetch failed but status worked).
export function buildView(status, usage, now = new Date()) {
    const usageByAccount = new Map();
    for (const row of usage?.rows ?? [])
        usageByAccount.set(row.key, row);

    const accounts = (status?.accounts ?? []).map(a => {
        const reserve = a.reserve ?? {};
        const windows = (a.windows ?? []).map(w => {
            const remaining = w.rolled ? 1 : (w.remaining_frac ?? 0);
            const res = reserve[w.kind] ?? reserve[w.kind.startsWith('weekly') ? 'weekly' : w.kind] ?? 0;
            return {
                kind: w.kind,
                label: windowLabel(w.kind),
                remaining,
                reserve: res,
                belowReserve: res > 0 && remaining <= res,
                countdown: formatCountdown(w.reset_at, now),
            };
        });
        const u = usageByAccount.get(a.id);
        return {
            id: a.id,
            provider: a.provider,
            healthy: !!a.healthy,
            stale: !!a.stale,
            error: a.error ?? null,
            reason: a.reason ?? null,
            backgroundOk: !!a.background_admissible,
            interactiveOk: !!a.interactive_admissible,
            windows,
            usage: u ? {
                requests: u.requests,
                input: u.input_tokens,
                output: u.output_tokens,
                cost: formatCost(u.cost_usd),
            } : null,
        };
    });

    return {accounts, panel: panelSummary(accounts)};
}

// Panel text: tightest 5h remaining across accounts that report one, or the
// pinned account when `pinned` names one that exists.
export function panelSummary(accounts, pinned = '') {
    let candidates = accounts.filter(a => a.windows.some(w => w.kind === '5h'));
    if (pinned) {
        const p = candidates.filter(a => a.id === pinned);
        if (p.length)
            candidates = p;
    }
    if (!candidates.length)
        return {text: 'LR', state: accounts.some(a => !a.healthy) ? 'warn' : 'ok', account: null};

    let best = null;
    for (const a of candidates) {
        const w = a.windows.find(x => x.kind === '5h');
        if (!best || w.remaining < best.w.remaining)
            best = {a, w};
    }
    let state = 'ok';
    if (best.w.belowReserve || best.w.remaining < 0.05)
        state = 'crit';
    else if (best.w.remaining < 0.25 || !best.a.healthy)
        state = 'warn';
    return {text: pct(best.w.remaining), state, account: best.a.id};
}
