import type { Room } from "livekit-client";
import {
  CircleMediaRecoveryController,
  type CircleMediaRecoveryOptions,
} from "./circleMediaRecovery";
import { CircleRtcTelemetry } from "./circleRtcTelemetry";

export interface CircleRtcRuntime {
  telemetry: CircleRtcTelemetry;
  recovery: CircleMediaRecoveryController;
  detach(): void;
}

export interface CircleRtcHardeningOptions
  extends Omit<CircleMediaRecoveryOptions, "telemetry"> {
  maxEvents?: number;
}

/** Install diagnostics and isolated media recovery before Room.connect(). */
export function installCircleRtcHardening(
  room: Room,
  options: CircleRtcHardeningOptions = {},
): CircleRtcRuntime {
  const telemetry = new CircleRtcTelemetry(options.maxEvents);
  telemetry.attachRoom(room);
  const recovery = new CircleMediaRecoveryController({
    ...options,
    telemetry,
  });
  recovery.attach(room);

  return {
    telemetry,
    recovery,
    detach() {
      recovery.destroy();
      telemetry.detachRoom();
    },
  };
}