# Burkeshot V11 — Calibrated Video

QUICK START
Extract the complete ZIP into a new folder, close older Burkeshot consoles,
then run START_BURKESHOT_V11.bat. The launcher normally opens port 8811.
Confirm the page footer says BURKESHOT v11 - CALIBRATED VIDEO.

HOW TO DISPLAY MEASUREMENTS
1. Record from a fixed, genuinely side-on camera. The initial ball flight and
   target line must travel across the image, not away from the phone.
2. Place a known 0.1-3 metre reference at the ball's depth, aligned along the
   target line. A one-metre ruler, tape measure or marked alignment stick works.
3. Keep the ball, reference and first ball/clubhead movement in the same camera
   plane. Perspective error cannot be removed from a single phone view.
4. Load and analyse the original high-frame-rate clip. Select its true mode:
   120 fps slow motion, 240 fps slow motion, or original real-time video.
5. In Calibrate video, choose SIDE-ON, enter the reference length, and click
   Mark reference A -> B. Click A, then B, pointing towards the target.
6. Confirm the camera plane and source-frame timing, then Calculate numbers.
7. If tracking is uncertain, open Correct missed tracking and mark at least four
   ball positions after impact and four clubhead positions before impact.
8. Save calibrated shot only after checking the overlay and result labels.

WHAT V11 CALCULATES
Ball speed and launch angle come from the calibrated displacement of the ball
across distinct source frames. Clubhead speed is independently fitted from the
clubhead positions before impact; it is not inferred from club selection or a
fixed smash factor. Attack angle is the planar clubhead direction at impact.

Carry is labelled MODELLED CARRY. It is a simple no-spin ballistic baseline
from calibrated ball speed and launch angle. The phone video does not measure
spin, drag, lift, wind, turf interaction or roll, so this is not real launch-
monitor carry and can differ substantially from the actual shot.

CURRENT SUPPLIED VIDEO
The supplied portrait clip is rear/down-the-line. Impact and a 2D trace were
detected, but its flight is predominantly into the image. V11 intentionally
leaves ball speed, launch angle, modelled carry and independent clubhead speed
blank for this clip. Selecting SIDE-ON does not override the geometry check.
Record a new side-on clip using the setup above to calculate those estimates.

GRAPHICS
Course includes the original Augusta-inspired Magnolia practice landscape with
pines, white bunkers, a pond, bridge and flowering banks. Select Course > Range
settings > 4K. Save 4K range image exports 3840 x 2160. WebGL2 and hardware
acceleration are required. This is not an Augusta National or Masters product,
and 4K pixel resolution is not a promise of GSPro-level rendering or frame rate.

MEASUREMENT SAFETY
Results are consumer video estimates, not certified launch-monitor readings.
Poor focus, motion blur, rolling shutter, variable frame timing, perspective,
incorrect reference placement or missed tracking can make them inaccurate.
V11 clears previous numbers whenever a new video, calibration or club is used.
It does not manufacture values when required evidence is unavailable.


No third-party logos, screenshots, code or proprietary engine are included.
