/// SME Layer 5: Animation Mixer — 8-directional pose blending.
///
/// Dart port of the spring-physics mixer channels from:
/// artifacts/pay-it-forward/src/components/SankofaBird/Core/AnimationMixer.ts
/// and useAnimationMixer.ts.
///
/// Each channel is a critically-damped spring that smooths its target value.

import 'dart:math';

/// A single spring-damped mixer channel.
class MixerChannel {
  final double stiffness;
  final double damping;

  double _pos;
  double _vel = 0;

  MixerChannel({required double initial, this.stiffness = 200, this.damping = 28})
      : _pos = initial;

  /// Advance the channel toward [target] by [dtMs] milliseconds.
  /// Returns the new position.
  double step(double target, double dtMs) {
    final dt = (dtMs / 1000).clamp(0.0, 0.05);
    // Semi-implicit Euler integration of a damped harmonic oscillator.
    final force = stiffness * (target - _pos) - damping * _vel;
    _vel += force * dt;
    _pos += _vel * dt;
    return _pos;
  }

  double get value => _pos;
}

/// All mixer channels that drive the rig's CSS vars.
class AnimationMixer {
  final MixerChannel bankDeg       = MixerChannel(initial: 0);
  final MixerChannel leanDeg       = MixerChannel(initial: 0);
  final MixerChannel headLeadDeg   = MixerChannel(initial: 0);
  final MixerChannel neckCurveDeg  = MixerChannel(initial: 0);
  final MixerChannel bodyTwistDeg  = MixerChannel(initial: 0);
  final MixerChannel vertGazeDeg   = MixerChannel(initial: 0);
  final MixerChannel tailBendDeg   = MixerChannel(initial: 0);
  final MixerChannel leftWingExtra = MixerChannel(initial: 0);
  final MixerChannel rightWingExtra= MixerChannel(initial: 0);
  final MixerChannel insideWingTuck= MixerChannel(initial: 0, stiffness: 160);
  final MixerChannel screenRotDeg  = MixerChannel(initial: 0, stiffness: 120, damping: 20);

  /// Advance all channels by [dtMs] milliseconds toward their [targets].
  void step({
    required double dtMs,
    required double targetBankDeg,
    required double targetLeanDeg,
    required double targetHeadLeadDeg,
    required double targetNeckCurveDeg,
    required double targetBodyTwistDeg,
    required double targetVertGazeDeg,
    required double targetTailBendDeg,
    required double targetLeftWingExtra,
    required double targetRightWingExtra,
    required double targetInsideWingTuck,
    required double targetScreenRotDeg,
  }) {
    bankDeg.step(targetBankDeg, dtMs);
    leanDeg.step(targetLeanDeg, dtMs);
    headLeadDeg.step(targetHeadLeadDeg, dtMs);
    neckCurveDeg.step(targetNeckCurveDeg, dtMs);
    bodyTwistDeg.step(targetBodyTwistDeg, dtMs);
    vertGazeDeg.step(targetVertGazeDeg, dtMs);
    tailBendDeg.step(targetTailBendDeg, dtMs);
    leftWingExtra.step(targetLeftWingExtra, dtMs);
    rightWingExtra.step(targetRightWingExtra, dtMs);
    insideWingTuck.step(targetInsideWingTuck, dtMs);
    screenRotDeg.step(targetScreenRotDeg, dtMs);
  }

  /// Compute the dynamic neck bezier control point from headLeadDeg.
  /// Returns `(ctrlX, ctrlY)` in viewBox 0 0 40 40.
  (double ctrlX, double ctrlY) neckBezierControl() {
    const nbX = 18.0, nbY = 16.0;
    const hpX = 8.0, hpY = 13.0;
    const dx = hpX - nbX; // -10
    const dy = hpY - nbY; // -3
    const len = 10.44; // sqrt(100+9)
    const px = -dy / len; // +0.287
    const py = dx / len;  // -0.958
    final bulge = sin(headLeadDeg.value * pi / 180) * len * 0.32;
    return (
      (nbX + hpX) / 2 + px * bulge,
      (nbY + hpY) / 2 + py * bulge,
    );
  }
}
