const segmentationPattern = /;|\b(?:nieuwe|volgende)\s+(?:(?:brain\s+)?fart|clutter|gedachte)\b/gi

export function splitCaptureText(text) {
  return String(text)
    .split(segmentationPattern)
    .map((segment) => segment.trim())
    .filter(Boolean)
}