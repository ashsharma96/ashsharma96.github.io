"""
Studio lighting environment for the portfolio's 3D ribbon, rendered in Blender (Cycles).

Renders an equirectangular HDR panorama from the centre of a small photo studio:
a large key softbox upper-left in front of the subject, a soft fill low right,
a long strip light overhead for a crisp top highlight, a vertical edge strip on
the right, and a paper-coloured floor that bounces light back up. The result is
used as scene.environment in three.js so the clearcoat shows real softbox
reflections instead of a generic room.

Axis note: three.js is Y-up and looks down -Z. Blender is Z-up. A three.js
direction (x, y, z) is Blender (x, -z, y).

Run with the Blender app:   blender -b -P studio_env.py
or with the bpy package:     python3 studio_env.py
Both write studio.blend and studio-raw.hdr next to this script.
"""
import math
import os
import bpy

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
W, H = 1024, 512


def three_dir_to_blender(x, y, z):
    return (x, -z, y)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def emission_mat(name, strength, color=(1, 1, 1)):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def diffuse_mat(name, color, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m


def softbox(name, three_dir, dist, size_x, size_y, strength, color=(1, 1, 1), roll=0.0):
    """A rectangular emissive card at a direction (three.js axes), facing the origin."""
    d = three_dir_to_blender(*three_dir)
    n = math.sqrt(sum(c * c for c in d))
    d = tuple(c / n for c in d)
    loc = tuple(c * dist for c in d)
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (size_x, size_y, 1)
    # point the plane's normal (+Z local) at the origin
    direction = tuple(-c for c in d)
    import mathutils
    rot = mathutils.Vector(direction).to_track_quat("Z", "Y")
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = rot @ mathutils.Quaternion((0, 0, 1), roll)
    ob.data.materials.append(emission_mat(name + "_mat", strength, color))
    # visible to the camera, but no shadows: it is a light card
    ob.visible_shadow = False
    return ob


def build():
    reset()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 160
    scene.cycles.use_denoising = True
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "HDR"

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.018, 0.019, 0.022, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world

    # paper-coloured studio floor and a soft cyclorama behind the camera
    paper = (0.745, 0.74, 0.74)  # #E2E1E1 in linear light
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -2.2))
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.data.materials.append(diffuse_mat("Paper", paper))

    # lights (three.js directions: +Z is toward the viewer, +Y up)
    softbox("Key", (-0.42, 0.55, 0.72), 6.0, 5.2, 3.6, 9.0)
    softbox("Fill", (0.62, 0.02, 0.78), 7.0, 5.0, 3.0, 2.4)
    softbox("TopStrip", (0.0, 0.97, -0.24), 5.0, 9.0, 0.7, 11.0)
    softbox("EdgeStrip", (0.96, 0.2, 0.18), 5.5, 0.6, 5.0, 5.0, roll=0.0)
    softbox("BackCard", (-0.3, 0.25, -0.92), 7.0, 4.0, 3.0, 1.2, color=(0.86, 0.9, 1.0))

    # equirectangular camera at the origin looking along Blender +X
    cam_data = bpy.data.cameras.new("Pano")
    cam_data.type = "PANO"
    cam_data.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("Pano", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, 0, 0)
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    scene.camera = cam
    return scene


if __name__ == "__main__":
    scene = build()
    bpy.ops.wm.save_as_mainfile(filepath=f"{OUT_DIR}/studio.blend")
    scene.render.filepath = f"{OUT_DIR}/studio-raw.hdr"
    bpy.ops.render.render(write_still=True)
    print("done")
