#!/usr/bin/env python3
"""Simple script to run the FastAPI server using uvicorn."""
import os
import sys

# IMPORTANT: Set CUDA memory optimization BEFORE any torch import
# This reduces memory fragmentation for large models like DA3
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

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

# Clear any leftover CUDA memory from previous runs
try:
    import torch
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        # Log GPU memory status
        total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        reserved = torch.cuda.memory_reserved(0) / (1024**3)
        allocated = torch.cuda.memory_allocated(0) / (1024**3)
        print(f"GPU Memory: {total:.1f}GB total, {reserved:.1f}GB reserved, {allocated:.1f}GB allocated")
        print(f"CUDA allocator: {os.environ.get('PYTORCH_CUDA_ALLOC_CONF', 'default')}")
except Exception as e:
    print(f"CUDA init note: {e}")

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes
        reload_dirs=["app"],  # Only watch the app directory for changes
    )

