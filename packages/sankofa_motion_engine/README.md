# sankofa_motion_engine

Standalone Flutter package for the **Sankofa Motion Engine (SME)** — a pure-Dart kinematic solver that drives the SankofaBird SVG/canvas marker in the Niakofa community mutual-aid platform.

## Architecture

```
GPS / Props
    ↓
FlightState   (sensor snapshot — Layer 2)
    ↓
MotionSolver  (head→tail kinematic chain — Layer 3)
    ↓
SensorEngine  (props → FlightState mapping — Layer 4)
    ↓
AnimationMixer (8-directional pose blending — Layer 5)
    ↓
SankofaRig    (SVG transform output)
```

This package mirrors the TypeScript implementation in
`artifacts/pay-it-forward/src/components/SankofaBird/Core/` but runs
natively in Flutter — no Rive `.riv` file required, no Unity build needed.
All animation is computed in pure math.

## Key features

- **360° directional turning** — head leads, neck follows, body banks
- **Real-time eye tracking** — eyes follow the direction of travel on screen
- **Dynamic neck bezier** — neck visually bends toward wherever the head is looking
- **Wind heading blend** — crosswind drift before the kinematic chain responds
- **Smooth wing amplitude/frequency** — fluid flight-mode transitions
- **Battery-saver path** — skips physics loop entirely, writes static values
- **Frame-rate independent** — all damping uses `1 − exp(−rate × dt)`

## Usage

```dart
import 'package:sankofa_motion_engine/sankofa_motion_engine.dart';

final solver = MotionSolver(rig: SankofaRig());

// Each animation frame:
final state = FlightState(
  headingRadians: gpsHeadingRad,
  velocity: speed / 15.0,        // normalised 0..1
  turnRate: bankDeg / 28.6,
  hoverAmount: 0.0,
  landing: false,
  idle: false,
  windX: 0, windY: 0,
  windStrength: 0, windHeading: 0,
  notificationPulse: 0,
  batterySaver: false,
  screenRotationDeg: screenRotDeg,
  facingSign: facingSign,
);
final output = solver.step(state, dtSeconds);

// output.headDeg, output.neckUpperDeg, output.eyeX, output.eyeY …
```

## Running tests

```bash
flutter test
```
