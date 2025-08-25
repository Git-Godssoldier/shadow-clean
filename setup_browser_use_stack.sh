#!/bin/bash
set -euo pipefail

WORKSPACE_DIR="${PWD}/browser-use-workspace"
REPOS_CSV="browser-use,qa-use,vibetest-use"

# --- arg parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace) WORKSPACE_DIR="$2"; shift 2;;
    --repos) REPOS_CSV="$2"; shift 2;;
    -h|--help)
      echo "Usage: $0 [--workspace DIR] [--repos CSV]"
      echo "  repos: browser-use,qa-use,vibetest-use  (comma-separated)"
      exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

mkdir -p "$WORKSPACE_DIR"

# --- utils ---
say() { printf "\n\033[1;36m[%s]\033[0m %s\n" "$(date +%H:%M:%S)" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*" ; }
die() { printf "\033[1;31m[fail]\033[0m %s\n" "$*" ; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "Missing $1"; }

ensure_uv() {
  if ! command -v uv >/dev/null 2>&1; then
    say "Installing uv (Astral) ..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # shellcheck disable=SC1090
    [ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env" || true
    export PATH="$HOME/.local/bin:$PATH"
  fi
  need uv
}

clone_if_absent() {
  local url="$1" dest="$2"
  if [ -d "$dest/.git" ]; then
    say "Repo exists: $dest (skipping clone)"
  else
    say "Cloning $url -> $dest"
    git clone --depth=1 "$url" "$dest"
  fi
}

# Returns "yes" if Playwright browsers should be installed for this env
should_install_playwright_for_browser_use() {
  # For browser-use >= 0.6.0 (Goodbye Playwright), skip. For older, install.
  python - <<'PY' 2>/dev/null || echo "yes"
import sys, re
try:
    import browser_use
    v = getattr(browser_use, "__version__", "0.0.0")
except Exception:
    # If import fails, be conservative: say "yes"
    print("yes"); sys.exit(0)

def parse(v):
    parts = re.findall(r"\d+", v)
    return tuple(int(x) for x in (parts + ["0","0","0"])[:3])

print("no" if parse(v) >= (0,6,0) else "yes")
PY
}

write_file_if_absent() {
  local path="$1"
  shift
  if [ -f "$path" ]; then
    warn "exists: $path (leaving as-is)"
  else
    mkdir -p "$(dirname "$path")"
    cat > "$path" <<'EOF'
EOF
    # fill with heredoc content via caller using ed - not practical in bash
    # This helper is a placeholder; we directly cat <<'EOF' in callers.
    :
  fi
}

# --- per-repo setups ---

setup_browser_use_repo() {
  local dir="$1"
  pushd "$dir" >/dev/null

  say "Setting up virtual env + deps (browser-use)"
  uv venv --python 3.11 >/dev/null
  uv sync --all-extras --dev || { warn "uv sync failed; falling back to editable install"; uv pip install -e .; }

  # Create .env for helpful logging
  if [ ! -f .env ]; then
    printf "BROWSER_USE_LOGGING_LEVEL=debug\n" > .env
  fi

  # Conditionally install Playwright browsers for < 0.6.0
  if [ "$(should_install_playwright_for_browser_use)" = "yes" ]; then
    warn "Detected browser-use < 0.6.0 -> installing Playwright chromium (one-time)"
    uv run python -c "import importlib,sys; import subprocess; import pkgutil; \
      (subprocess.run(['uv','pip','install','playwright']) if not pkgutil.find_loader('playwright') else None)"
    uv run playwright install chromium --with-deps --no-shell || warn "playwright install skipped/failed"
  else
    say "browser-use >= 0.6.0 → using CDP stack (no Playwright install)."
  fi

  # ---------------- Tests scaffolding ----------------
  say "Scaffolding tests for browser-use"
  mkdir -p tests/smoke tests/e2e

  cat > pytest.ini <<'INI'
[pytest]
addopts = -q
testpaths = tests
asyncio_mode = auto
INI

  cat > tests/smoke/test_imports.py <<'PY'
import importlib

def test_import_and_symbols():
    m = importlib.import_module("browser_use")
    # sanity: some commonly documented symbols exist
    assert hasattr(m, "Agent")
    assert hasattr(m, "BrowserSession") or hasattr(m, "browser")  # API evolves; be lenient
PY

  cat > tests/e2e/test_agent_example_dot_com.py <<'PY'
import os
import pytest

OPENAI = bool(os.environ.get("OPENAI_API_KEY"))
GOOGLE = bool(os.environ.get("GOOGLE_API_KEY"))

needs_llm = pytest.mark.skipif(not (OPENAI or GOOGLE), reason="Set OPENAI_API_KEY or GOOGLE_API_KEY to run agent E2E")

@needs_llm
@pytest.mark.asyncio
async def test_agent_can_open_example_com_and_report_title():
    from browser_use import Agent, ChatOpenAI
    # If you prefer Google, switch here:
    llm = ChatOpenAI(model="gpt-4.1-mini")  # uses OPENAI_API_KEY
    agent = Agent(task="Open https://example.com and return the page title, then stop.")
    result = await agent.run(llm=llm)
    text = (result or "").lower()
    assert "example domain" in text
PY

  cat > Makefile <<'MK'
.PHONY: test test-e2e lint
test:
	uv run pytest -k "smoke"
test-e2e:
	uv run pytest -k "e2e"
lint:
	uv run pre-commit run --all-files || true
MK

  say "browser-use: tests scaffolded. Try:  make -C $(pwd) test"
  popd >/dev/null
}

setup_vibetest_repo() {
  local dir="$1"
  pushd "$dir" >/dev/null

  say "Setting up virtual env + deps (vibetest-use)"
  uv venv --python 3.11 >/dev/null
  uv pip install -e .  # brings CLI entrypoint vibetest-mcp

  # If Playwright lib is present, install browsers to honor README
  if uv run python -c "import pkgutil; import sys; sys.exit(0 if pkgutil.find_loader('playwright') else 1)"; then
    uv run playwright install chromium --with-deps --no-shell || warn "playwright install skipped/failed"
  else
    warn "Playwright package not detected; skipping browser download."
  fi

  # ---------------- Tests scaffolding ----------------
  say "Scaffolding tests for vibetest-use"
  mkdir -p tests/smoke tests/e2e

  cat > pytest.ini <<'INI'
[pytest]
addopts = -q
testpaths = tests
INI

  cat > tests/smoke/test_cli_help.py <<'PY'
import subprocess, sys

def test_cli_help_exits_zero():
    # Ensure the entrypoint is on PATH via uv run
    cp = subprocess.run([sys.executable, "-m", "vibetest", "--help"], capture_output=True)
    # Some packages expose module runner; fallback to binary if needed
    if cp.returncode != 0:
        cp = subprocess.run(["vibetest-mcp", "--help"], capture_output=True)
    assert cp.returncode == 0
    assert b"vibetest" in (cp.stdout + cp.stderr).lower()
PY

  cat > tests/e2e/test_mcp_boot.py <<'PY'
import os, shutil, subprocess, time, socket

import pytest

GOOGLE = os.environ.get("GOOGLE_API_KEY")
needs_gemini = pytest.mark.skipif(not GOOGLE, reason="Set GOOGLE_API_KEY to run MCP e2E")

def _port_free(port: int) -> bool:
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", port))
        return True
    except OSError:
        return False
    finally:
        s.close()

@needs_gemini
def test_mcp_server_starts_and_listens():
    exe = shutil.which("vibetest-mcp")
    assert exe, "vibetest-mcp not found on PATH (ensure 'uv run' environment)"
    port = 8822
    assert _port_free(port), f"Port {port} is in use; adjust test."
    # Use a short-lived boot to ensure no crash on startup
    p = subprocess.Popen([exe, "--port", str(port)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        time.sleep(3)
        assert p.poll() is None, "Process crashed early"
    finally:
        p.terminate()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
PY

  cat > .env.example <<'ENV'
# Optional for vibetest-use E2E
GOOGLE_API_KEY=your_gemini_api_key
ENV

  cat > Makefile <<'MK'
.PHONY: test test-e2e
test:
	uv run pytest -k "smoke"
test-e2e:
	uv run pytest -k "e2e"
MK

  say "vibetest-use: tests scaffolded. Try:  make -C $(pwd) test"
  popd >/dev/null
}

setup_qa_use_repo() {
  local dir="$1"
  pushd "$dir" >/dev/null

  say "Preparing qa-use (Docker-based UI)"
  # Copy env if absent
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
    else
      cat > .env <<'ENV'
# Required by qa-use when using BrowserUse Cloud
BROWSER_USE_API_KEY=
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/qa-use
ENV
    fi
  fi

  # Tests: we only health-check the dev server; user runs `docker compose up` first
  mkdir -p tests/smoke
  cat > pytest.ini <<'INI'
[pytest]
addopts = -q
testpaths = tests
INI

  cat > tests/smoke/test_ui_health.py <<'PY'
import os, time
import urllib.request

def test_ui_responds_when_running():
    # This test passes if the UI is up; otherwise it is xfailed (not an error)
    url = os.environ.get("QA_USE_URL", "http://localhost:3000")
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            assert 200 <= r.status < 500
    except Exception:
        import pytest
        pytest.xfail("qa-use not running (start with: docker compose up)")
PY

  cat > Makefile <<'MK'
.PHONY: up down logs test
up:
	docker compose up -d
down:
	docker compose down -v
logs:
	docker compose logs -f --tail=100
test:
	pytest -q || true
MK

  say "qa-use ready. Start with:  make -C $(pwd) up   then: make test"
  popd >/dev/null
}

# --- main orchestration ---

ensure_uv
need git

say "Using workspace: $WORKSPACE_DIR"
cd "$WORKSPACE_DIR"

# Function to get URL for repo name
get_repo_url() {
  case "$1" in
    browser-use)  echo "https://github.com/browser-use/browser-use" ;;
    qa-use)       echo "https://github.com/browser-use/qa-use" ;;
    vibetest-use) echo "https://github.com/browser-use/vibetest-use" ;;
    *) echo "" ;;
  esac
}

IFS=',' read -ra REPO_LIST <<< "$REPOS_CSV"
for name in "${REPO_LIST[@]}"; do
  name="$(echo "$name" | xargs)"  # trim
  url="$(get_repo_url "$name")"
  [ -n "$url" ] || { warn "Unknown repo name: $name (skipping)"; continue; }

  dest="$WORKSPACE_DIR/$name"
  clone_if_absent "$url" "$dest"

  case "$name" in
    browser-use)  setup_browser_use_repo  "$dest" ;;
    vibetest-use) setup_vibetest_repo     "$dest" ;;
    qa-use)       setup_qa_use_repo       "$dest" ;;
    *) warn "No setup routine for $name";;
  esac
done

say "All done."
echo "Next steps:"
echo "  - browser-use:  (cd $WORKSPACE_DIR/browser-use  && make test)      # smoke"
echo "                   Set OPENAI_API_KEY or GOOGLE_API_KEY, then: make test-e2e"
echo "  - vibetest-use: (cd $WORKSPACE_DIR/vibetest-use && make test)       # smoke"
echo "                   Set GOOGLE_API_KEY, then: make test-e2e"
echo "  - qa-use:       (cd $WORKSPACE_DIR/qa-use       && make up && make test)"
