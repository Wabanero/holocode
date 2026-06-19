export interface HandTrackingOptions {
  handedness: "left" | "right" | "both";
  gestureThreshold: number;
}

export interface HandPose {
  pinchStrength: number;
  palmDirection: [number, number, number];
  jointsTracked: number;
}

export class HandTrackingSystem {
  constructor(private readonly options: HandTrackingOptions) {}

  start() {
    const neutralPose = normalizeHandPose({
      pinchStrength: 0,
      palmDirection: [0, 1, 0],
      jointsTracked: 0
    });

    return {
      status: "tracking",
      handedness: this.options.handedness,
      neutralPose
    };
  }

  classifyPose(pose: HandPose) {
    const normalized = normalizeHandPose(pose);
    return classifyGesture(normalized, this.options.gestureThreshold);
  }
}

export function createHandTrackingSystem(options: HandTrackingOptions) {
  return new HandTrackingSystem(options);
}

export function normalizeHandPose(pose: HandPose): HandPose {
  return {
    pinchStrength: Math.max(0, Math.min(1, pose.pinchStrength)),
    palmDirection: pose.palmDirection,
    jointsTracked: Math.max(0, pose.jointsTracked)
  };
}

export function classifyGesture(pose: HandPose, threshold: number) {
  if (pose.pinchStrength >= threshold) {
    return "pinch";
  }

  if (pose.jointsTracked < 12) {
    return "partial";
  }

  return "open-hand";
}
