# Original course imagery

These are original image-generation outputs used as texture assets. They are not
photographs of a named real course, licensed GSPro resources, or rendered images
of this simulator. The main course remains interactive three-dimensional geometry.

| Asset | Pixels | Use |
| --- | --- | --- |
| fairway-turf.png | 1254 × 1254 | RGB turf albedo and small-scale bump variation |
| oak-tree.png | 1254 × 1254 | Existing generated RGBA oak cutout, reused |
| pine-tree.png | 1254 × 1254 | New generated RGBA Scots pine cutout |

The turf generation request specified a square, seamless, top-down 1 m patch of
short-cut fairway grass under diffuse neutral daylight, with no mowing stripes,
objects, horizon, perspective, text or baked directional shadows. Requested 2048
pixels; the generator returned 1254 pixels. Exact edge tiling is not guaranteed;
mirrored wrapping and multi-scale sampling reduce repetition in the renderer.

The pine generation request specified one full-height mature Scots pine,
photorealistic needle and bark detail, front-on with neutral daylight, uncropped,
with no ground plane or cast shadow and actual transparent background including
gaps between branches. Requested approximately 2048 pixels; returned 1254 pixels
with a genuine alpha channel. Alpha testing removes transparent background.

The oak is a previously generated full-height photographic-style tree cutout
from this workspace. It has a genuine alpha channel and was visually inspected
before reuse. No exact prompt was retained with this earlier asset.

4K refers to the native render/export buffer, not these image dimensions. Foliage
uses photographic camera-facing cards with shadows. These are not fully modelled
trees and can exhibit flatness at unusual viewing angles.
