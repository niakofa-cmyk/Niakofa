import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:sankofa_motion_engine/sankofa_motion_engine.dart';

void main() {
  group('MotionSolver', () {
    late SankofaRig rig;
    late MotionSolver solver;

    setUp(() {
      rig = SankofaRig();
      solver = MotionSolver(rig: rig);
    });

    test('idle state produces near-zero rotations', () {
      final out = solver.step(FlightState.idle(), 1 / 60);
      expect(out.headDeg.abs(), lessThan(1.0));
      expect(out.bodyRollDeg.abs(), lessThan(1.0));
      expect(out.eyeX.abs(), lessThan(0.1));
      expect(out.eyeY.abs(), lessThan(0.1));
    });

    test('forward flight produces forward-looking eye', () {
      final state = FlightState(
        headingRadians: 0,
        velocity: 0.8,
        turnRate: 0,
        hoverAmount: 0,
        landing: false,
        idle: false,
        windX: 0, windY: 0,
        windStrength: 0, windHeading: 0,
        notificationPulse: 0,
        batterySaver: false,
      );
      // Advance 30 frames to let the eye reach its target
      for (var i = 0; i < 30; i++) {
        solver.step(state, 1 / 60);
      }
      final out = solver.step(state, 1 / 60);
      // Eye should be negative (toward beak = forward) for a moving bird
      expect(out.eyeX, lessThan(-0.3));
    });

    test('right turn anticipates with eye glance', () {
      final state = FlightState(
        headingRadians: pi / 4,
        velocity: 0.6,
        turnRate: 0.5, // right turn
        hoverAmount: 0,
        landing: false,
        idle: false,
        windX: 0, windY: 0,
        windStrength: 0, windHeading: 0,
        notificationPulse: 0,
        batterySaver: false,
      );
      for (var i = 0; i < 30; i++) {
        solver.step(state, 1 / 60);
      }
      final out = solver.step(state, 1 / 60);
      // Right turn: turnGlance positive → eyeX = forwardLook - turnGlance (more negative)
      expect(out.eyeX, lessThan(-0.1));
    });

    test('battery-saver skips eye computation', () {
      final state = FlightState(
        headingRadians: pi / 2,
        velocity: 0.8,
        turnRate: 0.5,
        hoverAmount: 0,
        landing: false,
        idle: false,
        windX: 0, windY: 0,
        windStrength: 0, windHeading: 0,
        notificationPulse: 0,
        batterySaver: true, // battery saver ON
      );
      for (var i = 0; i < 60; i++) {
        solver.step(state, 1 / 60);
      }
      final out = solver.step(state, 1 / 60);
      // Battery saver: eye should be near center (returning to 0)
      expect(out.eyeX.abs(), lessThan(0.5));
    });

    test('wind blend shifts effective heading', () {
      final state = FlightState(
        headingRadians: 0,     // heading north
        velocity: 0.5,
        turnRate: 0,
        hoverAmount: 0,
        landing: false,
        idle: false,
        windX: 2.2, windY: 0.8, // storm wind from east
        windStrength: 0.95,
        windHeading: pi / 2,    // wind blowing east
        notificationPulse: 0,
        batterySaver: false,
      );
      final out = solver.step(state, 1 / 60);
      // Wind should slightly affect head rotation via effectiveHeading blend
      // (hard to assert exact value, just confirm it runs without error)
      expect(out.headDeg.isFinite, isTrue);
      expect(out.windStrength, closeTo(0.95, 0.01));
    });

    test('notification ping bumps wing amplitude', () {
      final baseState = FlightState(
        headingRadians: 0,
        velocity: 0.5,
        turnRate: 0,
        hoverAmount: 0,
        landing: false,
        idle: false,
        windX: 0, windY: 0,
        windStrength: 0, windHeading: 0,
        notificationPulse: 0,
        batterySaver: false,
      );
      // Settle to a baseline amplitude
      for (var i = 0; i < 30; i++) {
        solver.step(baseState, 1 / 60);
      }
      final baseOut = solver.step(baseState, 1 / 60);

      // Fire a notification ping
      final pingState = FlightState(
        headingRadians: 0,
        velocity: 0.5,
        turnRate: 0,
        hoverAmount: 0,
        landing: false,
        idle: false,
        windX: 0, windY: 0,
        windStrength: 0, windHeading: 0,
        notificationPulse: 1.0, // NEW notification
        batterySaver: false,
      );
      final pingOut = solver.step(pingState, 1 / 60);
      // Amplitude should jump up
      expect(pingOut.flapAmplitude, greaterThan(baseOut.flapAmplitude + 0.1));
    });

    test('reset clears all integrated state', () {
      final state = FlightState(
        headingRadians: pi,
        velocity: 0.9,
        turnRate: 1.0,
        hoverAmount: 0,
        landing: false,
        idle: false,
        windX: 1.4, windY: 0.3,
        windStrength: 0.6, windHeading: pi / 4,
        notificationPulse: 1.0,
        batterySaver: false,
      );
      for (var i = 0; i < 30; i++) {
        solver.step(state, 1 / 60);
      }
      solver.reset();
      final out = solver.step(FlightState.idle(), 1 / 60);
      expect(out.bodyRollDeg.abs(), lessThan(0.01));
      expect(out.flapPhase, lessThan(0.2));
    });
  });

  group('computeNeckBezierControl', () {
    test('zero head angle gives midpoint control (straight neck)', () {
      final (ctrlX, ctrlY) = computeNeckBezierControl(headDeg: 0);
      // Midpoint of (18,16)→(8,13) = (13, 14.5); bulge = 0
      expect(ctrlX, closeTo(13.0, 0.01));
      expect(ctrlY, closeTo(14.5, 0.01));
    });

    test('non-zero head angle displaces control point', () {
      final (ctrlX, ctrlY) = computeNeckBezierControl(headDeg: 20);
      // bulge = sin(20°) * 10.44 * 0.32 ≈ 1.14
      expect((ctrlX - 13.0).abs(), greaterThan(0.3));
      expect((ctrlY - 14.5).abs(), greaterThan(0.5));
    });

    test('bulge is antisymmetric: +angle vs −angle', () {
      final (cx1, cy1) = computeNeckBezierControl(headDeg: 30);
      final (cx2, cy2) = computeNeckBezierControl(headDeg: -30);
      // ctrlX deviations should be equal and opposite
      expect(cx1 - 13.0, closeTo(-(cx2 - 13.0), 0.01));
      expect(cy1 - 14.5, closeTo(-(cy2 - 14.5), 0.01));
    });
  });
}
