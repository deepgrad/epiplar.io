"""
GLB to PLY Converter

Converts GLB/GLTF files to PLY point cloud format.
Extracts vertices and colors from the mesh.
Properly applies node transformations for correct world-space coordinates.

Usage:
    python glb2ply.py input.glb [output.ply]

If output is not specified, saves to same directory with .ply extension.
"""

import numpy as np
from pathlib import Path
import struct
import json
import math


def quaternion_to_matrix(q):
    """Convert quaternion [x, y, z, w] to 4x4 rotation matrix."""
    x, y, z, w = q
    return np.array([
        [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w, 0],
        [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w, 0],
        [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y, 0],
        [0, 0, 0, 1]
    ], dtype=np.float64)


def get_node_transform(node):
    """Get the 4x4 transformation matrix for a node."""
    if 'matrix' in node:
        # Direct matrix (column-major in glTF)
        m = np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
        return m

    # Build from TRS
    T = np.eye(4, dtype=np.float64)
    R = np.eye(4, dtype=np.float64)
    S = np.eye(4, dtype=np.float64)

    if 'translation' in node:
        t = node['translation']
        T[0, 3] = t[0]
        T[1, 3] = t[1]
        T[2, 3] = t[2]

    if 'rotation' in node:
        R = quaternion_to_matrix(node['rotation'])

    if 'scale' in node:
        s = node['scale']
        S[0, 0] = s[0]
        S[1, 1] = s[1]
        S[2, 2] = s[2]

    return T @ R @ S


def transform_points(points, matrix):
    """Apply 4x4 transformation matrix to Nx3 points."""
    n = len(points)
    homogeneous = np.ones((n, 4), dtype=np.float64)
    homogeneous[:, :3] = points
    transformed = homogeneous @ matrix.T
    return transformed[:, :3].astype(np.float32)


def load_glb(glb_path: str) -> tuple:
    """
    Load GLB file and extract vertices and colors.
    Applies node transformations to get world-space coordinates.
    Returns (vertices, colors) as numpy arrays.
    """
    with open(glb_path, 'rb') as f:
        # GLB header
        magic = f.read(4)
        if magic != b'glTF':
            raise ValueError("Not a valid GLB file")

        version = struct.unpack('<I', f.read(4))[0]
        length = struct.unpack('<I', f.read(4))[0]

        # Read chunks
        json_chunk = None
        bin_chunk = None

        while f.tell() < length:
            chunk_length = struct.unpack('<I', f.read(4))[0]
            chunk_type = f.read(4)
            chunk_data = f.read(chunk_length)

            if chunk_type == b'JSON':
                json_chunk = json.loads(chunk_data.decode('utf-8'))
            elif chunk_type == b'BIN\x00':
                bin_chunk = chunk_data

    if json_chunk is None or bin_chunk is None:
        raise ValueError("Invalid GLB: missing JSON or BIN chunk")

    # Parse glTF structure
    accessors = json_chunk.get('accessors', [])
    buffer_views = json_chunk.get('bufferViews', [])
    meshes = json_chunk.get('meshes', [])
    nodes = json_chunk.get('nodes', [])
    scenes = json_chunk.get('scenes', [])
    default_scene = json_chunk.get('scene', 0)

    def get_mesh_data(mesh_idx):
        """Extract vertices and colors from a mesh."""
        mesh = meshes[mesh_idx]
        mesh_vertices = []
        mesh_colors = []

        for primitive in mesh.get('primitives', []):
            attributes = primitive.get('attributes', {})

            # Get position data
            if 'POSITION' in attributes:
                pos_accessor = accessors[attributes['POSITION']]
                pos_view = buffer_views[pos_accessor['bufferView']]

                offset = pos_view.get('byteOffset', 0) + pos_accessor.get('byteOffset', 0)
                count = pos_accessor['count']

                vertices = np.frombuffer(
                    bin_chunk[offset:offset + count * 12],
                    dtype=np.float32
                ).reshape(-1, 3).copy()

                mesh_vertices.append(vertices)

                # Get color data
                if 'COLOR_0' in attributes:
                    col_accessor = accessors[attributes['COLOR_0']]
                    col_view = buffer_views[col_accessor['bufferView']]

                    col_offset = col_view.get('byteOffset', 0) + col_accessor.get('byteOffset', 0)
                    col_count = col_accessor['count']

                    comp_type = col_accessor.get('componentType', 5126)

                    if comp_type == 5126:  # FLOAT
                        n_components = 3 if col_accessor.get('type') == 'VEC3' else 4
                        colors = np.frombuffer(
                            bin_chunk[col_offset:col_offset + col_count * 4 * n_components],
                            dtype=np.float32
                        ).reshape(-1, n_components)[:, :3].copy()
                    elif comp_type == 5121:  # UNSIGNED_BYTE
                        n_components = 3 if col_accessor.get('type') == 'VEC3' else 4
                        colors = np.frombuffer(
                            bin_chunk[col_offset:col_offset + col_count * n_components],
                            dtype=np.uint8
                        ).reshape(-1, n_components)[:, :3].astype(np.float32) / 255.0
                    else:
                        colors = np.ones((col_count, 3), dtype=np.float32) * 0.7

                    mesh_colors.append(colors)
                else:
                    mesh_colors.append(np.ones((len(vertices), 3), dtype=np.float32) * 0.7)

        if mesh_vertices:
            return np.vstack(mesh_vertices), np.vstack(mesh_colors)
        return None, None

    def process_node(node_idx, parent_transform):
        """Recursively process node and its children, applying transforms."""
        node = nodes[node_idx]
        local_transform = get_node_transform(node)
        world_transform = parent_transform @ local_transform

        results = []

        # If this node has a mesh, extract and transform it
        if 'mesh' in node:
            vertices, colors = get_mesh_data(node['mesh'])
            if vertices is not None:
                transformed_vertices = transform_points(vertices, world_transform)
                results.append((transformed_vertices, colors))

        # Process children
        for child_idx in node.get('children', []):
            results.extend(process_node(child_idx, world_transform))

        return results

    all_vertices = []
    all_colors = []

    # Process scene hierarchy
    if scenes and default_scene < len(scenes):
        scene = scenes[default_scene]
        root_nodes = scene.get('nodes', [])
    else:
        # No scene defined, process all nodes without parents
        children_set = set()
        for node in nodes:
            for child_idx in node.get('children', []):
                children_set.add(child_idx)
        root_nodes = [i for i in range(len(nodes)) if i not in children_set]

    # Process each root node
    identity = np.eye(4, dtype=np.float64)
    for root_idx in root_nodes:
        results = process_node(root_idx, identity)
        for verts, cols in results:
            all_vertices.append(verts)
            all_colors.append(cols)

    # Fallback: if no nodes reference meshes, extract meshes directly
    if not all_vertices:
        print("  Warning: No node hierarchy found, extracting meshes directly")
        for mesh_idx in range(len(meshes)):
            vertices, colors = get_mesh_data(mesh_idx)
            if vertices is not None:
                all_vertices.append(vertices)
                all_colors.append(colors)

    if not all_vertices:
        raise ValueError("No vertices found in GLB")

    vertices = np.vstack(all_vertices)
    colors = np.vstack(all_colors)

    # Convert from Y-up (GLB/glTF standard) to Z-up (common for point clouds)
    # Swap Y and Z axes: (x, y, z) -> (x, z, -y)
    # This makes the floor horizontal in XY plane with Z pointing up
    vertices_zup = np.column_stack([
        vertices[:, 0],   # X stays X
        -vertices[:, 2],  # Y becomes -Z (depth)
        vertices[:, 1]    # Z becomes Y (height)
    ])

    return vertices_zup, colors


def save_ply(vertices: np.ndarray, colors: np.ndarray, ply_path: str):
    """Save vertices and colors to PLY file."""
    n_points = len(vertices)

    # Ensure colors are in 0-255 range
    if colors.max() <= 1.0:
        colors_uint8 = (colors * 255).astype(np.uint8)
    else:
        colors_uint8 = colors.astype(np.uint8)

    header = f"""ply
format binary_little_endian 1.0
element vertex {n_points}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
"""

    with open(ply_path, 'wb') as f:
        f.write(header.encode('ascii'))

        # Write vertex data
        for i in range(n_points):
            f.write(struct.pack('<fff', *vertices[i]))
            f.write(struct.pack('<BBB', *colors_uint8[i]))

    print(f"Saved: {ply_path} ({n_points:,} points)")


def convert_glb_to_ply(glb_path: str, ply_path: str = None) -> str:
    """
    Convert GLB file to PLY.

    Args:
        glb_path: Path to input GLB file
        ply_path: Path to output PLY file (optional, defaults to same name)

    Returns:
        Path to output PLY file
    """
    glb_path = Path(glb_path)

    if not glb_path.exists():
        raise FileNotFoundError(f"GLB file not found: {glb_path}")

    if ply_path is None:
        ply_path = glb_path.with_suffix('.ply')
    else:
        ply_path = Path(ply_path)

    print(f"Loading: {glb_path}")
    vertices, colors = load_glb(str(glb_path))
    print(f"Extracted: {len(vertices):,} vertices")

    save_ply(vertices, colors, str(ply_path))

    return str(ply_path)


def main():
    import sys

    if len(sys.argv) < 2:
        print("GLB to PLY Converter")
        print("Usage: python glb2ply.py input.glb [output.ply]")
        sys.exit(1)

    glb_path = sys.argv[1]
    ply_path = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        output = convert_glb_to_ply(glb_path, ply_path)
        print(f"Done: {output}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
