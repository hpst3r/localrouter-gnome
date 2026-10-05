UUID := localrouter@wporter.org
SRC  := $(UUID)
DEST := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: test check pack install uninstall nested

test:
	gjs -m tests/model_test.js

# Live check against a running router: make live URL=http://127.0.0.1:8787 KEY=
live:
	gjs -m tests/live_client.js $(or $(URL),http://127.0.0.1:8787) $(KEY)

check: test
	for f in $(SRC)/*.js $(SRC)/lib/*.js; do node --input-type=module --check < $$f || exit 1; done
	glib-compile-schemas --strict --dry-run $(SRC)/schemas

pack: check
	mkdir -p build  # gnome-extensions pack segfaults if -o dir is missing
	cd $(SRC) && gnome-extensions pack --force --extra-source=lib --schema=schemas/org.gnome.shell.extensions.localrouter.gschema.xml -o ../build .

# Symlink install for development. GNOME Shell on Wayland only picks up a new
# extension after re-login (or use `make nested`).
install:
	mkdir -p $(dir $(DEST))
	glib-compile-schemas $(SRC)/schemas
	ln -sfn $(CURDIR)/$(SRC) $(DEST)
	@echo "Installed -> $(DEST). Log out/in, then: gnome-extensions enable $(UUID)"

uninstall:
	-gnome-extensions disable $(UUID)
	rm -f $(DEST)

# Nested test shell (GNOME 49+: needs `sudo dnf install mutter-devkit`).
nested: install
	dbus-run-session -- gnome-shell --devkit --wayland
