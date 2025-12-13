FROM nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies (including build tools for gsplat)
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    ffmpeg \
    libsm6 \
    libxext6 \
    git \
    curl \
    build-essential \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Set python3.11 as default and install pip for it
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Upgrade pip
RUN python3.11 -m pip install --upgrade pip

# Install Python dependencies
RUN python3.11 -m pip install --no-cache-dir -r requirements.txt

# Install depth-anything-3 from git
RUN python3.11 -m pip install --no-cache-dir git+https://github.com/ByteDance-Seed/Depth-Anything-3.git

# Install gsplat for Gaussian Splatting PLY export (gs_ply format)
# This specific commit is recommended by Depth Anything 3 for the gaussian head
RUN python3.11 -m pip install --no-cache-dir --no-build-isolation git+https://github.com/nerfstudio-project/gsplat.git@0b4dddf04cb687367602c01196913cde6a743d70

# Copy application code
COPY app/ ./app/

# Create temp directory
RUN mkdir -p /tmp/garaza

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
