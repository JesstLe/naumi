"""Inspect the browser download and independently composite its live PSD layers."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage

def rgba(image):
    return np.asarray(image.convert("RGBA")).astype(np.int16)

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

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("original", type=Path)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    verify(args.original, args.directory)
