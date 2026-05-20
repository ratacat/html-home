#!/usr/bin/env bash
set -euo pipefail

repo_url="${HTML_HOME_REPO_URL:-https://github.com/ratacat/html-home.git}"
install_dir="${HTML_HOME_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/html-home}"
bin_dir="${HTML_HOME_BIN_DIR:-$HOME/.local/bin}"
bin_path="$bin_dir/html-home"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "html-home installer: missing required command: $1" >&2
    exit 1
  fi
}

need git
need bun

mkdir -p "$bin_dir"

if [ -d "$install_dir/.git" ]; then
  echo "Updating html-home in $install_dir"
  git -C "$install_dir" remote set-url origin "$repo_url"
  git -C "$install_dir" fetch --depth 1 origin main
  git -C "$install_dir" checkout -q main
  git -C "$install_dir" reset --hard -q origin/main
elif [ -e "$install_dir" ]; then
  echo "html-home installer: $install_dir exists but is not a git checkout" >&2
  echo "Set HTML_HOME_INSTALL_DIR to another path or move the existing directory." >&2
  exit 1
else
  echo "Installing html-home into $install_dir"
  git clone --depth 1 --branch main "$repo_url" "$install_dir"
fi

(
  cd "$install_dir"
  bun install --production
)

cat > "$bin_path" <<EOF
#!/usr/bin/env bash
exec bun "$install_dir/src/cli.ts" "\$@"
EOF
chmod +x "$bin_path"

echo "html-home installed at $bin_path"
if ! command -v html-home >/dev/null 2>&1; then
  echo "Add $bin_dir to PATH to run html-home from anywhere."
fi
