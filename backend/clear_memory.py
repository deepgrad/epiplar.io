#!/usr/bin/env python3
"""
Standalone script to clear memory (RAM and GPU) on RunPod.
Can be run directly to free up memory.

Usage:
    python clear_memory.py                    # Show memory usage
    python clear_memory.py --clear            # Clear GPU and RAM
    python clear_memory.py --clear-gpu        # Only clear GPU cache
    python clear_memory.py --clear-ram        # Only run garbage collection
    python clear_memory.py --unload-model     # Unload DA3 model (frees most memory)
"""

import sys
import argparse
import gc
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent))

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False


def format_size_gb(size_gb: float) -> str:
    """Format size in GB with appropriate units."""
    if size_gb >= 1:
        return f"{size_gb:.2f} GB"
    else:
        return f"{size_gb * 1024:.2f} MB"


def get_memory_info():
    """Get current memory usage."""
    info = {
        "ram": None,
        "gpu": None,
    }
    
    # RAM
    if PSUTIL_AVAILABLE:
        ram = psutil.virtual_memory()
        info["ram"] = {
            "total_gb": ram.total / (1024**3),
            "used_gb": ram.used / (1024**3),
            "available_gb": ram.available / (1024**3),
            "percent": ram.percent,
        }
    
    # GPU
    if TORCH_AVAILABLE and torch.cuda.is_available():
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        gpu_allocated = torch.cuda.memory_allocated(0) / (1024**3)
        gpu_reserved = torch.cuda.memory_reserved(0) / (1024**3)
        gpu_free = gpu_memory - gpu_reserved
        
        info["gpu"] = {
            "total_gb": gpu_memory,
            "allocated_gb": gpu_allocated,
            "reserved_gb": gpu_reserved,
            "free_gb": gpu_free,
            "percent": (gpu_reserved / gpu_memory) * 100 if gpu_memory > 0 else 0,
        }
    
    return info


def clear_gpu_cache():
    """Clear GPU/CUDA cache."""
    if not TORCH_AVAILABLE:
        print("⚠️  PyTorch not available, cannot clear GPU cache")
        return False
    
    if not torch.cuda.is_available():
        print("⚠️  CUDA not available, no GPU cache to clear")
        return False
    
    try:
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        print("✅ GPU cache cleared")
        return True
    except Exception as e:
        print(f"❌ Error clearing GPU cache: {e}")
        return False


def clear_ram():
    """Run Python garbage collection."""
    try:
        collected = gc.collect()
        print(f"✅ Garbage collection: {collected} objects collected")
        return True, collected
    except Exception as e:
        print(f"❌ Error running garbage collection: {e}")
        return False, 0


def unload_model():
    """Unload DA3 model from memory."""
    try:
        from app.services.depth_service import depth_service
        
        if depth_service._model is None:
            print("ℹ️  Model not loaded, nothing to unload")
            return False
        
        depth_service._model = None
        depth_service._device = None
        
        # Clear GPU cache after unloading
        if TORCH_AVAILABLE and torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        print("✅ DA3 model unloaded from memory")
        return True
    except Exception as e:
        print(f"❌ Error unloading model: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Clear memory (RAM and GPU) on RunPod",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear both GPU cache and RAM (garbage collection)",
    )
    parser.add_argument(
        "--clear-gpu",
        action="store_true",
        help="Clear GPU/CUDA cache only",
    )
    parser.add_argument(
        "--clear-ram",
        action="store_true",
        help="Run Python garbage collection only",
    )
    parser.add_argument(
        "--unload-model",
        action="store_true",
        help="Unload DA3 model from memory (frees most memory, requires reload on next inference)",
    )

    args = parser.parse_args()

    # Show current memory
    print("=== Current Memory Usage ===\n")
    info = get_memory_info()
    
    if info["ram"]:
        ram = info["ram"]
        print("RAM:")
        print(f"  Total:    {format_size_gb(ram['total_gb'])}")
        print(f"  Used:     {format_size_gb(ram['used_gb'])} ({ram['percent']:.1f}%)")
        print(f"  Available: {format_size_gb(ram['available_gb'])}")
        print()
    
    if info["gpu"]:
        gpu = info["gpu"]
        print("GPU:")
        print(f"  Total:    {format_size_gb(gpu['total_gb'])}")
        print(f"  Reserved: {format_size_gb(gpu['reserved_gb'])} ({gpu['percent']:.1f}%)")
        print(f"  Allocated: {format_size_gb(gpu['allocated_gb'])}")
        print(f"  Free:     {format_size_gb(gpu['free_gb'])}")
        print()
    elif TORCH_AVAILABLE:
        print("GPU: Not available or no CUDA device")
        print()
    
    # Perform cleanup if requested
    if args.clear or args.clear_gpu or args.clear_ram or args.unload_model:
        print("=== Clearing Memory ===\n")
        
        if args.unload_model:
            unload_model()
        
        if args.clear or args.clear_gpu:
            clear_gpu_cache()
        
        if args.clear or args.clear_ram:
            clear_ram()
        
        # Show memory after cleanup
        print("\n=== Memory After Cleanup ===\n")
        info_after = get_memory_info()
        
        if info_after["ram"]:
            ram = info_after["ram"]
            print("RAM:")
            print(f"  Used:     {format_size_gb(ram['used_gb'])} ({ram['percent']:.1f}%)")
            print(f"  Available: {format_size_gb(ram['available_gb'])}")
            print()
        
        if info_after["gpu"]:
            gpu = info_after["gpu"]
            print("GPU:")
            print(f"  Reserved: {format_size_gb(gpu['reserved_gb'])} ({gpu['percent']:.1f}%)")
            print(f"  Free:     {format_size_gb(gpu['free_gb'])}")
            print()
    else:
        print("Use --clear, --clear-gpu, --clear-ram, or --unload-model to free memory")
        print("\nOptions:")
        print("  --clear         Clear both GPU and RAM")
        print("  --clear-gpu     Clear GPU cache only")
        print("  --clear-ram     Run garbage collection only")
        print("  --unload-model  Unload DA3 model (frees most memory)")


if __name__ == "__main__":
    main()

