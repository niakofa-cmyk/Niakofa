/// SME Layer 4: Sensor Engine — maps props → FlightState.
///
/// Dart port of artifacts/pay-it-forward/src/components/SankofaBird/Core/SensorEngine.ts

import 'dart:math';
import 'flight_state.dart';

/// Wind vector map (matching the TypeScript WIND_TABLE).
const _windTable = {
  'clear': (x: 0.0,  y: 0.0),
  'windy': (x: 1.4,  y: 0.3),
  'rain':  (x: 0.5,  y: 0.6),
  'snow':  (x: 0.2,  y: 0.4),
  'storm': (x: 2.2,  y: 0.8),
};

final _maxWindMagnitude = sqrt(2.2 * 2.2 + 0.8 * 0.8); // ≈ 2.34

/// Build a [FlightState] from raw sensor inputs.
FlightState buildFlightState({
  required double? heading,   // degrees, null = no GPS
  required double speed,      // m/s
  required String weather,
  required bool batterySaver,
  required double bankDeg,
  required bool landing,
  required bool idle,
  required bool eventFired,
  double screenRotationDeg = 0,
  double facingSign = 1,
}) {
  final headingRadians = heading != null ? heading * pi / 180 : 0.0;
  final velocity = (speed / 15.0).clamp(0.0, 1.0);
  final turnRate = bankDeg / 28.6;

  final wind = _windTable[weather] ?? _windTable['clear']!;
  final windMagnitude = sqrt(wind.x * wind.x + wind.y * wind.y);
  final windStrength = (windMagnitude / _maxWindMagnitude).clamp(0.0, 1.0);
  final windHeading = windMagnitude > 0
      ? atan2(wind.y, wind.x) - pi / 2
      : 0.0;

  return FlightState(
    headingRadians: headingRadians,
    velocity: velocity,
    turnRate: turnRate,
    hoverAmount: 0,
    landing: landing,
    idle: idle,
    windX: wind.x,
    windY: wind.y,
    windStrength: windStrength,
    windHeading: windHeading,
    notificationPulse: eventFired ? 1.0 : 0.0,
    batterySaver: batterySaver,
    screenRotationDeg: screenRotationDeg,
    facingSign: facingSign,
  );
}
