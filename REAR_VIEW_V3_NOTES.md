# Rear-view v3 calibration notes

Rear-view v3 keeps the Ronde evidence-gated tracker and changes only the perspective reconstruction.

Key changes:
- Calibrate focal scale from the stationary golf-ball diameter rather than the first moving streak.
- Estimate and remove motion-blur inflation from the moving streak minor axis.
- Include the impact anchor at t=0 in robust Theil-Sen style slope fitting.
- Use only early, high-quality observations for launch velocity.
- Keep rear-view outputs explicitly labelled experimental and do not infer club speed or attack angle.

Validation clip supplied by the project owner has reference ball speed 111 mph and carry 141 m. This reference is used for validation only; it is not embedded as a correction factor in the model.
