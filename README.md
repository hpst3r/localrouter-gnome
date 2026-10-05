# localrouter-gnome

GNOME Shell (50) top-bar indicator for [LocalRouter](../localrouter). It polls the
router's read-only control API and shows:

- **Top bar:** the lowest 5h quota remaining across accounts (or a pinned
  account), coloured yellow below 25% and red at/below the account's reserve.
- **Menu:** per-account bars for every quota window with a reserve marker and
  reset countdown, health/stale/background-admissible flags, policy reason, and
  24h requests/tokens/cost. Cost is LocalRouter's **list-price estimate**, not
  a charge, and is labelled `~$x est.`.
- Refresh, open the web dashboard, settings.

Uses only `GET /control/v1/status` and `GET /control/v1/usage?since=24h&group=account`
(see LocalRouter `docs/SPEC.md` → Control API). Never writes to the router.

## Settings

| Key | Default | |
|---|---|---|
| `server-url` | `http://127.0.0.1:8787` | central router URL in multi-host mode |
| `key-file` | empty | client key path; needed when `control.require_auth: true`. Read on each poll, never copied into dconf |
| `poll-interval` | 30 s | also refreshes when the menu opens |
| `panel-account` | empty | pin the top-bar figure to one account |

## Develop

```bash
make check     # unit tests (plain gjs) + syntax + schema
make live      # fetch from the running router and print the view model
make install   # symlink into ~/.local/share/gnome-shell/extensions, compile schema
# log out/in (Wayland), then:
gnome-extensions enable localrouter@wporter.org
journalctl --user -f -o cat /usr/bin/gnome-shell   # errors
```

`make nested` runs a throwaway nested shell instead of re-logging; on GNOME 49+
that needs `mutter-devkit`.

`lib/model.js` is pure JS (no GI) so view logic is tested without a shell;
`lib/client.js` (libsoup 3) is exercised by `make live`. `extension.js`/`prefs.js`
only run inside GNOME Shell.
