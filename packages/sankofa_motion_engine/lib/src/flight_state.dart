/// SME Layer 2: Flight State — unified sensor snapshot.
///
/// Dart port of artifacts/pay-it-forward/src/components/SankofaBird/Core/FlightState.ts
/// Pure data class — no Flutter, no widgets.

class FlightState {
  /// Desired direction of travel in radians (0 = north/up on screen).
  final double headingRadians;

  /// Normalised ground speed [0..1].  1 ≈ 15 m/s (brisk cycling).
  final double velocity;

  /// Turn rate in rad/s, signed (positive = clockwise / right turn).
  final double turnRate;

  /// Hover intensity [0..1]. 1 = fully hovering / near-landing deceleration.
  final double hoverAmount;

  /// True during final landing deceleration sequence.
  final bool landing;

  /// True when stationary and not navigating.
  final bool idle;

  /// Wind vector x-component in SVG units/s.
  final double windX;

  /// Wind vector y-component in SVG units/s.
  final double windY;

  /// Wind strength [0..1] — blended into effectiveHeading before head responds.
  final double windStrength;

  /// Wind heading in radians (north = 0 convention).
  final double windHeading;

  /// Notification pulse [0..1] — set to 1.0 on event; solver decays it.
  final double notificationPulse;

  /// Mirror of battery-saver prop — skips heavy physics when true.
  final bool batterySaver;

  /// Screen rotation of bird in degrees (0 = north, 90 = east).
  /// Used to make eyes track the actual map heading on screen.
  final double screenRotationDeg;

  /// Facing sign: +1 = faces LEFT (west headings), −1 = faces RIGHT (east).
  final double facingSign;

  const FlightState({
    required this.headingRadians,
    required this.velocity,
    required this.turnRate,
    required this.hoverAmount,
    required this.landing,
    required this.idle,
    required this.windX,
    required this.windY,
    required this.windStrength,
    required this.windHeading,
    required this.notificationPulse,
    required this.batterySaver,
    this.screenRotationDeg = 0,
    this.facingSign = 1,
  });

  /// Default (stationary idle) state.
  factory FlightState.idle() => const FlightState(
        headingRadians: 0,
        velocity: 0,
        turnRate: 0,
        hoverAmount: 0,
        landing: false,
        idle: true,
        windX: 0,
        windY: 0,
        windStrength: 0,
        windHeading: 0,
        notificationPulse: 0,
        batterySaver: false,
      );
}
