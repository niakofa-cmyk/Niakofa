/// SME Layer 3: Motion Solver — head-to-tail kinematic chain.
///
/// Dart port of artifacts/pay-it-forward/src/components/SankofaBird/Core/MotionSolver.ts
/// Pure class — no Flutter, no widgets.  Runs inside an animation ticker.
///
/// Key principle: "Head leads — it tracks target heading fastest.
///   Neck follows partially.  Body banks last and least."

import 'dart:math';
import 'flight_state.dart';
import 'sankofa_rig.dart';

/// Result of one MotionSolver tick.
class SolverOutput {
  final double headDeg;
  final double neckUpperDeg;
  final double neckLowerDeg;
  final double bodyRollDeg;
  final double tailDeg;
  final double leftWingUpperDeg;
  final double leftWingLowerDeg;
  final double rightWingUpperDeg;
  final double rightWingLowerDeg;
  final double eyeX;
  final double eyeY;
  final double flapPhase;
  final double flapAmplitude;
  final double notificationPulse;
  final double smoothedHeadingDeltaRad;
  final double windStrength;

  const SolverOutput({
    required this.headDeg,
    required this.neckUpperDeg,
    required this.neckLowerDeg,
    required this.bodyRollDeg,
    required this.tailDeg,
    required this.leftWingUpperDeg,
    required this.leftWingLowerDeg,
    required this.rightWingUpperDeg,
    required this.rightWingLowerDeg,
    required this.eyeX,
    required this.eyeY,
    required this.flapPhase,
    required this.flapAmplitude,
    required this.notificationPulse,
    required this.smoothedHeadingDeltaRad,
    required this.windStrength,
  });
}

double _shortestAngle(double from, double to) {
  double diff = (to - from) % (2 * pi);
  if (diff > pi) diff -= 2 * pi;
  if (diff < -pi) diff += 2 * pi;
  return diff;
}

double _clamp(double v, double min, double max) =>
    v < min ? min : (v > max ? max : v);

/// Frame-rate-independent exponential approach.
double _dampedApproach(double current, double target, double rate, double dt) =>
    current + (target - current) * (1 - exp(-rate * dt));

/// Angular variant of dampedApproach — takes shortest path.
double _dampedApproachAngle(
    double current, double target, double rate, double dt) {
  final delta = _shortestAngle(current, target);
  return current + delta * (1 - exp(-rate * dt));
}

double _lerpAngle(double a, double b, double t) {
  final delta = _shortestAngle(a, b);
  return a + delta * _clamp(t, 0, 1);
}

class MotionSolver {
  final SankofaRig rig;

  double _headingSmoothed = 0;
  double _bodyRoll = 0;
  double _flapPhase = 0;
  double _notificationDecay = 0;
  double _wingAmplitude = 0.4;
  double _wingFreq = 2.5;
  double _eyeX = 0;
  double _eyeY = 0;

  MotionSolver({required this.rig});

  SolverOutput step(FlightState state, double dt) {
    final dtClamped = dt.clamp(0, 0.05);

    // Wind heading blend into effectiveHeading
    final windStrength = state.windStrength;
    final windHeading = state.windHeading;
    final effectiveHeading = windStrength > 0
        ? _lerpAngle(state.headingRadians, windHeading, windStrength * 0.3)
        : state.headingRadians;

    // 1. Smooth heading
    _headingSmoothed =
        _dampedApproachAngle(_headingSmoothed, effectiveHeading, 6.0, dtClamped);
    final smoothedDelta = _shortestAngle(_headingSmoothed, effectiveHeading);

    // 2. Kinematic chain
    const radToDeg = 180 / pi;
    rig.setRotation(BirdPart.head, smoothedDelta * radToDeg * 0.9);
    rig.setRotation(BirdPart.neckUpper, smoothedDelta * radToDeg * 0.5);
    rig.setRotation(BirdPart.neckLower, smoothedDelta * radToDeg * 0.25);

    // 3. Body roll
    final targetRoll =
        state.landing ? state.turnRate * 0.6 * 0.2 : state.turnRate * 0.6;
    _bodyRoll = _dampedApproach(_bodyRoll, targetRoll, 4.0, dtClamped);
    rig.setRotation(BirdPart.chest, _bodyRoll * 0.3 * radToDeg);
    final chestNode = rig.get(BirdPart.chest);
    rig.setRotation(
        BirdPart.chest, chestNode.localDeg + state.windX * 0.05);

    // 4. Tail
    rig.setRotation(BirdPart.tail, -_bodyRoll * 0.8 * radToDeg);

    // 5. Wings
    final speed = _clamp(state.velocity, 0, 1);
    final hover = _clamp(state.hoverAmount, 0, 1);

    double targetAmplitude;
    double targetFrequency;
    if (hover > 0.5) {
      targetAmplitude = 0.9 - (hover - 0.5) * 0.4;
      targetFrequency = 2.2;
    } else if (speed > 0.7) {
      targetAmplitude = 0.35;
      targetFrequency = 4.0;
    } else {
      targetAmplitude = 0.5 + speed * 0.25;
      targetFrequency = 2.5;
    }

    final effectiveTargetAmp = state.idle ? 0.12 : targetAmplitude;
    final effectiveTargetFreq = state.idle ? 0.4 : targetFrequency;

    _wingAmplitude =
        _dampedApproach(_wingAmplitude, effectiveTargetAmp, 6.0, dtClamped);
    _wingFreq =
        _dampedApproach(_wingFreq, effectiveTargetFreq, 6.0, dtClamped);

    if (state.notificationPulse > _notificationDecay) {
      _notificationDecay = state.notificationPulse;
      _wingAmplitude = _clamp(_wingAmplitude + 0.25, 0, 1);
    } else {
      _notificationDecay =
          (_notificationDecay - dtClamped * 1.25).clamp(0, 1);
    }

    _flapPhase = (_flapPhase + _wingFreq * dtClamped * 2 * pi) % (2 * pi);
    final flap = sin(_flapPhase) * _wingAmplitude;

    final lwuDeg = -flap * radToDeg;
    final lwlDeg = -flap * 0.6 * radToDeg;
    rig.setRotation(BirdPart.leftWingUpper, lwuDeg);
    rig.setRotation(BirdPart.leftWingLower, lwlDeg);
    final rwuDeg = flap * radToDeg;
    final rwlDeg = flap * 0.6 * radToDeg;
    rig.setRotation(BirdPart.rightWingUpper, rwuDeg);
    rig.setRotation(BirdPart.rightWingLower, rwlDeg);

    // 6. Eye tracking — follows travel direction on screen
    if (!state.batterySaver) {
      final eyeSpeed = _clamp(state.velocity, 0, 1);
      final forwardLook = state.idle ? 0.0 : -(eyeSpeed * 0.85);
      final turnGlance = _clamp(state.turnRate * 0.35, -0.6, 0.6);
      final eyeXTarget = _clamp(forwardLook - turnGlance, -1.5, 1.5);
      final eyeYTarget = state.landing ? 0.4 : (eyeSpeed > 0.6 ? -0.3 : 0.0);
      _eyeX = _dampedApproach(_eyeX, eyeXTarget, 10.0, dtClamped);
      _eyeY = _dampedApproach(_eyeY, _clamp(eyeYTarget, -1.5, 1.5), 10.0, dtClamped);
    } else {
      _eyeX = _dampedApproach(_eyeX, 0, 4.0, dtClamped);
      _eyeY = _dampedApproach(_eyeY, 0, 4.0, dtClamped);
    }

    // 7. Propagate world rotations
    rig.resolveAll();

    final head = rig.get(BirdPart.head);
    final neckUpper = rig.get(BirdPart.neckUpper);
    final neckLower = rig.get(BirdPart.neckLower);
    final chest = rig.get(BirdPart.chest);
    final tail = rig.get(BirdPart.tail);
    final lwu = rig.get(BirdPart.leftWingUpper);
    final lwl = rig.get(BirdPart.leftWingLower);
    final rwu = rig.get(BirdPart.rightWingUpper);
    final rwl = rig.get(BirdPart.rightWingLower);

    return SolverOutput(
      headDeg: head.localDeg,
      neckUpperDeg: neckUpper.localDeg,
      neckLowerDeg: neckLower.localDeg,
      bodyRollDeg: chest.localDeg,
      tailDeg: tail.localDeg,
      leftWingUpperDeg: lwu.localDeg,
      leftWingLowerDeg: lwl.localDeg,
      rightWingUpperDeg: rwu.localDeg,
      rightWingLowerDeg: rwl.localDeg,
      eyeX: _eyeX,
      eyeY: _eyeY,
      flapPhase: _flapPhase,
      flapAmplitude: _wingAmplitude,
      notificationPulse: _notificationDecay,
      smoothedHeadingDeltaRad: smoothedDelta,
      windStrength: windStrength,
    );
  }

  void reset() {
    _headingSmoothed = 0;
    _bodyRoll = 0;
    _flapPhase = 0;
    _notificationDecay = 0;
    _wingAmplitude = 0.4;
    _wingFreq = 2.5;
    _eyeX = 0;
    _eyeY = 0;
    rig.reset();
  }
}
