import shutil
import subprocess
from pathlib import Path

import uvicorn


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    pnpm = shutil.which("pnpm") or shutil.which("pnpm.cmd")
    if not pnpm:
        raise SystemExit("pnpm was not found. Install Node.js and pnpm, then run: pnpm --dir frontend install")

    frontend = subprocess.Popen([pnpm, "--dir", str(root / "frontend"), "dev", "--host", "127.0.0.1"])
    try:
        print("Frontend: http://127.0.0.1:5173")
        print("Backend:  http://127.0.0.1:8000")
        uvicorn.run("backend:app", host="127.0.0.1", port=8000, reload=False)
    finally:
        frontend.terminate()
        try:
            frontend.wait(timeout=5)
        except subprocess.TimeoutExpired:
            frontend.kill()
