"""Inspect the browser download and independently composite its live PSD layers."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage

def rgba(image):
    return np.asarray(image.convert("RGBA")).astype(np.int16)

def verify_single_layers(original, exported, directory):
    edited_layers = {layer.name: layer for layer in exported}
    for index, original_layer in enumerate(original):
        edited = edited_layers[original_layer.name]
        solo = PSDImage.open(directory / f"layer-{index}.psd")
        png = rgba(Image.open(directory / f"layer-{index}.png"))
        assert len(solo) == 1 and solo.size == original_layer.size
        layer = solo[0]
        assert layer.name == edited.name and layer.visible and layer.offset == (0, 0)
        pixels = rgba(original_layer.topil())
        assert np.array_equal(rgba(layer.topil()), pixels)
        assert layer.has_mask() == edited.has_mask()
        alpha = pixels[..., 3]
        if edited.has_mask():
            matte = np.asarray(edited.mask.topil().convert("L"))
            assert layer.mask.bbox == (0, 0, *solo.size)
            assert np.array_equal(np.asarray(layer.mask.topil().convert("L")), matte)
            alpha = np.rint(alpha.astype(np.float64) * matte / 255)
        assert np.array_equal(png[..., 3], alpha), layer.name
        visible = alpha > 0
        assert np.array_equal(png[..., :3][visible], pixels[..., :3][visible]), layer.name
        # Compare the actual rendered PSD and PNG on both dark and light surfaces.
        rebuilt = layer.composite().convert("RGBA")
        with Image.open(directory / f"layer-{index}.png") as png_file:
            for color in ("black", "white"):
                background = Image.new("RGBA", solo.size, color)
                rendered = rgba(Image.alpha_composite(background, rebuilt))
                expected = rgba(Image.alpha_composite(background, png_file.convert("RGBA")))
                assert np.abs(rendered - expected).max() <= 2, layer.name
        if index == 10:
            assert np.array_equal(png, rgba(Image.open(directory / "dirty-bottle.png")))
    assert not edited_layers[original[-2].name].visible, "fixture includes a hidden layer"

def verify(original_path, directory):
    original = PSDImage.open(original_path)
    exported = PSDImage.open(directory / "browser-export.psd")
    assert len(original) == len(exported) == 11
    assert original.size == exported.size
    names = [layer.name for layer in original]
    names.insert(-2, names.pop())
    assert [layer.name for layer in exported] == names
    originals = {layer.name: layer for layer in original}
    for layer in exported:
        prior = originals[layer.name]
        assert np.array_equal(rgba(layer.topil()), rgba(prior.topil())), layer.name
    masked = [layer for layer in exported if layer.has_mask()]
    assert len(masked) == 1
    subject = masked[0]
    assert subject.name == original[-1].name and subject.offset != original[-1].offset
    mask = np.asarray(subject.mask.topil().convert("L"))
    assert mask.min() == 0 and mask.max() == 255 and np.any((mask > 0) & (mask < 255))
    snapshot = rgba(Image.open(directory / "edited-canvas.png"))
    displayed = rgba(Image.open(directory / "displayed-child.png"))
    assert np.array_equal(snapshot, displayed), "actual canvas child differs after reloading"
    thumbnail = rgba(Image.open(directory / "node-preview.png"))
    assert np.array_equal(snapshot, thumbnail), "saved artwork image differs from edited browser canvas"
    assert np.array_equal(snapshot, rgba(exported.topil())), "PSD merged preview differs from browser canvas"
    computed = rgba(exported.composite(ignore_preview=True))
    difference = np.abs(snapshot - computed)
    stats = {"layers":len(exported), "canvas_size":exported.size,
             "editable_masks":len(masked), "native_mask_range":[int(mask.min()),int(mask.max())],
             "displayed_child_max_difference":0,"saved_preview_max_difference":0, "psd_preview_max_difference":0,
             "independent_composite_max_difference":int(difference.max()),
             "independent_composite_mean_difference":float(difference.mean())}
    print(json.dumps(stats, ensure_ascii=False))
    assert difference.max() <= 2, "independent reconstruction disagrees with canvas"
    verify_single_layers(original, exported, directory)
    print("Single layer downloads verified: 11 PNG and 11 editable PSD, layer dimensions, RGB, alpha and masks.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("original", type=Path)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    verify(args.original, args.directory)
