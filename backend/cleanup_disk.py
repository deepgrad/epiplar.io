#!/usr/bin/env python3
"""
Standalone script to clean up old job files on disk.
Can be run directly on RunPod to free up space.

Usage:
    python cleanup_disk.py                    # Show disk usage and list jobs
    python cleanup_disk.py --delete-all       # Delete ALL jobs (dangerous!)
    python cleanup_disk.py --delete-old 24    # Delete jobs older than 24 hours
    python cleanup_disk.py --dry-run          # Show what would be deleted
"""

import sys
import argparse
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent))

from app.utils.file_utils import get_disk_usage, get_job_directories, cleanup_old_jobs
from app.config import settings


def format_size_gb(size_gb: float) -> str:
    """Format size in GB with appropriate units."""
    if size_gb >= 1:
        return f"{size_gb:.2f} GB"
    else:
        return f"{size_gb * 1024:.2f} MB"


def main():
    parser = argparse.ArgumentParser(
        description="Clean up old job files to free disk space",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--delete-all",
        action="store_true",
        help="Delete ALL job directories (use with caution!)",
    )
    parser.add_argument(
        "--delete-old",
        type=float,
        metavar="HOURS",
        help="Delete jobs older than specified hours",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without actually deleting",
    )
    parser.add_argument(
        "--temp-dir",
        type=str,
        help=f"Override temp directory (default: {settings.temp_dir})",
    )

    args = parser.parse_args()

    # Override temp_dir if provided
    if args.temp_dir:
        settings.temp_dir = Path(args.temp_dir)

    print(f"Temp directory: {settings.temp_dir}")
    print(f"Exists: {settings.temp_dir.exists()}\n")

    # Get disk usage
    disk_info = get_disk_usage(settings.temp_dir)
    print("=== Disk Usage ===")
    print(f"Total: {format_size_gb(disk_info['total_gb'])}")
    print(f"Used:  {format_size_gb(disk_info['used_gb'])} ({disk_info['used_percent']:.1f}%)")
    print(f"Free:  {format_size_gb(disk_info['free_gb'])}")
    print()

    # Get job directories
    jobs = get_job_directories()
    print(f"=== Job Directories ({len(jobs)} found) ===")
    
    if not jobs:
        print("No job directories found.")
        return

    total_job_size = sum(j["size_bytes"] for j in jobs)
    print(f"Total job size: {format_size_gb(total_job_size / (1024**3))}")
    print()

    # Show top 10 largest jobs
    jobs_by_size = sorted(jobs, key=lambda x: x["size_bytes"], reverse=True)
    print("Top 10 largest jobs:")
    for i, job in enumerate(jobs_by_size[:10], 1):
        age_str = f"{job['age_hours']:.1f}h" if job['age_hours'] < 24 else f"{job['age_hours']/24:.1f}d"
        print(f"  {i}. {job['job_id'][:8]}... - {format_size_gb(job['size_gb'])} - {age_str} old")
    print()

    # Perform cleanup if requested
    if args.delete_all or args.delete_old is not None:
        if args.dry_run:
            print("=== DRY RUN - No files will be deleted ===")
            result = cleanup_old_jobs(
                max_age_hours=args.delete_old if args.delete_old else None,
                dry_run=True,
            )
            print(f"Would delete {result['would_delete_count']} jobs")
            print(f"Would free {format_size_gb(result['would_delete_size_gb'])}")
        else:
            # Confirm deletion
            if args.delete_all:
                confirm = input(
                    f"⚠️  WARNING: This will delete ALL {len(jobs)} jobs! Type 'DELETE ALL' to confirm: "
                )
                if confirm != "DELETE ALL":
                    print("Cancelled.")
                    return
            else:
                old_jobs = [j for j in jobs if j["age_hours"] > args.delete_old]
                confirm = input(
                    f"⚠️  This will delete {len(old_jobs)} jobs older than {args.delete_old} hours. Continue? (yes/no): "
                )
                if confirm.lower() != "yes":
                    print("Cancelled.")
                    return

            print("\nDeleting jobs...")
            result = cleanup_old_jobs(
                max_age_hours=args.delete_old if args.delete_old else None,
                dry_run=False,
            )
            print(f"✅ Deleted {result['deleted_count']} jobs")
            print(f"✅ Freed {format_size_gb(result['deleted_size_gb'])}")
            
            if result.get("errors"):
                print(f"\n⚠️  {len(result['errors'])} errors occurred:")
                for error in result["errors"]:
                    print(f"  - {error['job_id']}: {error['error']}")

            # Show updated disk usage
            disk_info_after = get_disk_usage(settings.temp_dir)
            print("\n=== Disk Usage After Cleanup ===")
            print(f"Used:  {format_size_gb(disk_info_after['used_gb'])} ({disk_info_after['used_percent']:.1f}%)")
            print(f"Free:  {format_size_gb(disk_info_after['free_gb'])}")
    else:
        print("Use --delete-all or --delete-old HOURS to clean up jobs")
        print("Add --dry-run to see what would be deleted first")


if __name__ == "__main__":
    main()

