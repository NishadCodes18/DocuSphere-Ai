import sys
from pathlib import Path

# Add backend directory to sys.path so app module is importable
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app

try:
    from mangum import Mangum
    handler = Mangum(app)
except Exception:
    handler = app

__all__ = ["app", "handler"]
