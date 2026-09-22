/// Pure math helpers for the Sankofa Motion Engine.
///
/// Dart port of artifacts/pay-it-forward/src/lib/sankofa-bird-math.ts
/// (subset used by the motion solver and animation mixer).

import 'dart:math';

/// Shortest signed angular distance from [from] to [to] in radians.
double shortestAngle(double from, double to) {
  double diff = (to - from) % (2 * pi);
  if (diff > pi) diff -= 2 * pi;
  if (diff < -pi) diff += 2 * pi;
  return diff;
}

/// Frame-rate-independent exponential approach.
/// [rate] ≈ approaches per second.  Uses `1 − exp(−rate × dt)`.
double dampedApproach(double current, double target, double rate, double dt) =>
    current + (target - current) * (1 - exp(-rate * dt));

/// Angular variant of dampedApproach — always takes the shortest path.
double dampedApproachAngle(
    double current, double target, double rate, double dt) {
  final delta = shortestAngle(current, target);
  return current + delta * (1 - exp(-rate * dt));
}

/// Lerp between two angles, taking the shortest path.
double lerpAngle(double a, double b, double t) {
  final delta = shortestAngle(a, b);
  return a + delta * t.clamp(0.0, 1.0);
}

/// Clamp [v] to [[min], [max]].
double clamp(double v, double min, double max) =>
    v < min ? min : (v > max ? max : v);

/// Compute the dynamic neck bezier control point for the given head angle.
///
/// Returns `(ctrlX, ctrlY)` in SVG viewBox 0 0 40 40 space.
/// The control point is displaced perpendicular to the rest-pose neck vector
/// so the neck visually bends toward where the head is looking.
///
/// [neckBaseX/Y] = neck-meets-body pivot (default 18, 16).
/// [headPivX/Y]  = head center pivot (default 8, 13).
/// [headDeg]     = current head lead angle in degrees (sign-corrected).
(double ctrlX, double ctrlY) computeNeckBezierControl({
  double neckBaseX = 18,
  double neckBaseY = 16,
  double headPivX = 8,
  double headPivY = 13,
  required double headDeg,
}) {
  final dx = headPivX - neckBaseX;
  final dy = headPivY - neckBaseY;
  final len = sqrt(dx * dx + dy * dy);
  // Perpendicular unit vector (90° CCW rotation of neck direction)
  final px = -dy / len;
  final py = dx / len;
  // Bulge proportional to sin of head angle × 32% of neck length
  final bulge = sin(headDeg * pi / 180) * len * 0.32;
  final ctrlX = (neckBaseX + headPivX) / 2 + px * bulge;
  final ctrlY = (neckBaseY + headPivY) / 2 + py * bulge;
  return (ctrlX, ctrlY);
}
