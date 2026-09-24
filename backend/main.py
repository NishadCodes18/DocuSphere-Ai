import sys
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app

# Expose handler for AWS Lambda / Vercel Serverless Function invocations
try:
    from mangum import Mangum
    handler = Mangum(app)
except Exception:
    handler = app

__all__ = ["app", "handler"]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
