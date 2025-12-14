#!/usr/bin/env python3
"""Simple script to run the FastAPI server using uvicorn."""
import sys

# Check if depth-anything-3 is installed
try:
    import depth_anything_3
except ImportError:
    print("ERROR: depth-anything-3 package is not installed.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Install it with:", file=sys.stderr)
    print("  pip install -r requirements.txt", file=sys.stderr)
    print("", file=sys.stderr)
    print("If you get 'Cannot uninstall blinker' error, use:", file=sys.stderr)
    print("  pip install --ignore-installed blinker git+https://github.com/ByteDance-Seed/Depth-Anything-3.git", file=sys.stderr)
    sys.exit(1)

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes
        reload_dirs=["app"],  # Only watch the app directory for changes
    )

