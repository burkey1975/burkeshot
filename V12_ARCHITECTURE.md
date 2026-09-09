# V12 architecture and next model milestone

## Delivered foundation

- FastAPI owns uploads, jobs, progress, cancellation and persistence.
- PyAV supplies presentation timestamps for original real-time footage.
- OpenCV performs deterministic ball, impact and club tracking.
- A selected ball anchor overrides the old lower-right image assumption.
- The browser owns the one calibrated calculation until calibration is promoted
  to a typed API request in a later release.
- Three.js remains independent and consumes a small shot-result object.

## Optional learned detector boundary

The tracker is ready for a future `models/golf-ball.onnx` detector, but no model
is bundled because a useful detector must be trained and validated on permissioned
Burkeshot footage. A credible first dataset needs hundreds of labelled address
and post-impact frames across views, lighting conditions, mats and ball colours.

ONNX inference should generate candidate boxes only. Calibration, timestamps,
trajectory fitting and confidence rejection should remain deterministic.

## GSPro-class graphics boundary

The renderer can be improved with glTF vegetation, terrain splat maps, PBR
normal/roughness textures and level-of-detail assets. A Unity or Unreal client
should be a separate renderer consuming the same shot JSON contract rather than
replacing the analysis service.
