# 3D furniture models (drop-in)

The app renders furniture procedurally by default. To swap in **real 3D models**,
drop `.glb` files here and list their kinds in `manifest.json`. The app auto-fits
each model to the item's footprint and sits it on the floor — no code changes.

## Steps

1. Get CC0 (free, no-attribution) furniture models. Recommended packs:
   - **Kenney – Furniture Kit** → https://kenney.nl/assets/furniture-kit (CC0)
   - **Quaternius – Furniture / Interior packs** → https://quaternius.com (CC0)
   - **Poly Pizza** (per-model) → https://poly.pizza (filter License: CC0)

2. Export/convert each to **`.glb`** (binary glTF) and rename to match the kind,
   then put it in this folder:

   ```
   public/models/sofa.glb
   public/models/bed.glb
   public/models/chair.glb
   public/models/table.glb
   public/models/desk.glb
   public/models/plant.glb
   public/models/rug.glb
   public/models/toilet.glb
   public/models/sink.glb
   public/models/stove.glb
   ```

   (You only need the ones you want — the rest stay procedural.)

3. List the kinds you added in `manifest.json`:

   ```json
   { "available": ["sofa", "bed", "chair"] }
   ```

4. Reload the app and open **Model** view. Those items now use your GLB models.

## Notes

- Models are **auto-scaled** so their X/Z footprint matches the item size set in
  the app, and dropped onto the floor. Orientation should face **−Z** (the "back"
  of beds/sofas). If a model faces the wrong way, rotate it in your 3D tool before
  exporting, or rotate the item in the app.
- Keep models **low-poly** for performance (a plan can have many items).
- Only `.glb` is loaded here. Convert `.gltf`/`.obj`/`.fbx` first (e.g. with
  https://gltf.report or Blender's glTF exporter).
