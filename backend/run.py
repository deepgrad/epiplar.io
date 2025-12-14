#!/usr/bin/env python3
"""Simple script to run the FastAPI server using uvicorn."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes
        reload_dirs=["app"],  # Only watch the app directory for changes
    )

