export type SampleHealth = "connected" | "degraded" | "reconnecting" | "lost" | "unknown";
export interface PeerRtcSample {
  peerId: string; connectionState: string; iceConnectionState: string;
  bytesReceived: number; bytesSent: number; packetsLost: number;
  jitter?: number; rttMs?: number;
  audioInbound?: { packetsReceived: number; packetsLost: number; bytesReceived: number };
  videoInbound?: { packetsReceived: number; packetsLost: number; framesDecoded?: number; framesDropped?: number };
}
export interface EnduranceSample {
  ts: number; elapsedSec: number; health: SampleHealth; connectionLabel: string;
  localAudioLive: boolean; localVideoLive: boolean; remoteAudioPeers: number;
  remoteVideoPeers: number; reconnectCount: number; peers: PeerRtcSample[];
  jsHeapUsedMb?: number; jsHeapTotalMb?: number;
}
export interface EnduranceReport {
  sessionId: string | number; startedAt: number; endedAt: number; durationSec: number;
  sampleCount: number; reconnectCount: number; audioAvailabilityPct: number;
  videoAvailabilityPct: number; healthHistogram: Record<SampleHealth, number>;
  samples: EnduranceSample[];
  criteria: { audioTargetPct: number; videoTargetPct: number; audioPass: boolean; videoPass: boolean };
  notes: string[];
}
export interface EnduranceCollectorOptions {
  sessionId: string | number; intervalMs?: number;
  getPeerConnections: () => Map<number | string, RTCPeerConnection> | Iterable<[number | string, RTCPeerConnection]>;
  getConnectionLabel?: () => string; getLocalStream?: () => MediaStream | null | undefined;
  getReconnectCount?: () => number; expectVideo?: () => boolean; expectAudio?: () => boolean;
  onSample?: (sample: EnduranceSample) => void;
}

function health(label: string, peers: PeerRtcSample[]): SampleHealth {
  const lower = label.toLowerCase();
  if (lower.includes("reconnect")) return "reconnecting";
  if (lower === "lost" || lower === "failed" || peers.some(p => p.connectionState === "failed")) return "lost";
  if (peers.some(p => p.connectionState === "disconnected" || p.iceConnectionState === "disconnected")) return "degraded";
  if (lower === "connected" || peers.every(p => p.connectionState === "connected")) return "connected";
  return lower === "connecting" ? "reconnecting" : "unknown";
}

async function samplePeer(peerId: string, pc: RTCPeerConnection): Promise<PeerRtcSample> {
  const result: PeerRtcSample = {
    peerId, connectionState: pc.connectionState, iceConnectionState: pc.iceConnectionState,
    bytesReceived: 0, bytesSent: 0, packetsLost: 0,
  };
  const audio = { packetsReceived: 0, packetsLost: 0, bytesReceived: 0 };
  const video = { packetsReceived: 0, packetsLost: 0, framesDecoded: 0, framesDropped: 0 };
  try {
    const stats = await pc.getStats();
    stats.forEach(report => {
      if (report.type === "candidate-pair" && (report as RTCIceCandidatePairStats).state === "succeeded") {
        const rtt = (report as RTCIceCandidatePairStats & { currentRoundTripTime?: number }).currentRoundTripTime;
        if (typeof rtt === "number") result.rttMs = Math.round(rtt * 1000);
      }
      if (report.type === "inbound-rtp") {
        const r = report as RTCInboundRtpStreamStats;
        const kind = (r as RTCInboundRtpStreamStats & { kind?: string; mediaType?: string }).kind ??
          (r as RTCInboundRtpStreamStats & { mediaType?: string }).mediaType;
        if (kind === "audio") {
          audio.packetsReceived += r.packetsReceived ?? 0; audio.packetsLost += r.packetsLost ?? 0;
          audio.bytesReceived += r.bytesReceived ?? 0; result.bytesReceived += r.bytesReceived ?? 0;
          if (typeof r.jitter === "number") result.jitter = r.jitter;
        } else if (kind === "video") {
          video.packetsReceived += r.packetsReceived ?? 0; video.packetsLost += r.packetsLost ?? 0;
          video.framesDecoded += (r as RTCInboundRtpStreamStats & { framesDecoded?: number }).framesDecoded ?? 0;
          video.framesDropped += (r as RTCInboundRtpStreamStats & { framesDropped?: number }).framesDropped ?? 0;
          result.bytesReceived += r.bytesReceived ?? 0;
        }
      }
      if (report.type === "outbound-rtp") result.bytesSent += (report as RTCOutboundRtpStreamStats).bytesSent ?? 0;
    });
  } catch { /* closed peers can reject getStats during teardown */ }
  result.packetsLost = audio.packetsLost + video.packetsLost;
  result.audioInbound = audio; result.videoInbound = video;
  return result;
}

export class CircleEnduranceCollector {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private samples: EnduranceSample[] = [];
  private running = false;
  constructor(private readonly opts: EnduranceCollectorOptions) {}
  start(): void {
    if (this.running) return;
    this.running = true; this.startedAt = Date.now(); this.samples = [];
    void this.tick(); this.timer = setInterval(() => void this.tick(), this.opts.intervalMs ?? 5000);
  }
  stop(): EnduranceReport {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.running = false;
    const endedAt = Date.now(); const audioExpected = this.samples.filter(() => this.opts.expectAudio?.() ?? true).length;
    const videoExpected = this.samples.filter(() => this.opts.expectVideo?.() ?? false).length;
    const audioOk = this.samples.filter(s => (this.opts.expectAudio?.() ?? true) && (s.localAudioLive || s.remoteAudioPeers > 0 || s.health === "connected")).length;
    const videoOk = this.samples.filter(s => (this.opts.expectVideo?.() ?? false) && (s.localVideoLive || s.remoteVideoPeers > 0)).length;
    const audioAvailabilityPct = audioExpected ? 100 * audioOk / audioExpected : 100;
    const videoAvailabilityPct = videoExpected ? 100 * videoOk / videoExpected : 100;
    const histogram: Record<SampleHealth, number> = { connected: 0, degraded: 0, reconnecting: 0, lost: 0, unknown: 0 };
    this.samples.forEach(s => { histogram[s.health]++; });
    const notes = this.samples.length < 6 ? ["Too few samples; certify with at least 60 minutes at a 5-second interval."] : [];
    const first = this.samples.find(s => s.jsHeapUsedMb != null)?.jsHeapUsedMb;
    const last = [...this.samples].reverse().find(s => s.jsHeapUsedMb != null)?.jsHeapUsedMb;
    if (first != null && last != null && last > first * 2) notes.push(`Possible memory growth: heap ${first}MB → ${last}MB`);
    return {
      sessionId: this.opts.sessionId, startedAt: this.startedAt, endedAt,
      durationSec: Math.round((endedAt - this.startedAt) / 1000), sampleCount: this.samples.length,
      reconnectCount: this.samples.at(-1)?.reconnectCount ?? 0, audioAvailabilityPct, videoAvailabilityPct,
      healthHistogram: histogram, samples: [...this.samples],
      criteria: { audioTargetPct: 99.9, videoTargetPct: 99.5, audioPass: audioAvailabilityPct >= 99.9, videoPass: !(this.opts.expectVideo?.() ?? false) || videoAvailabilityPct >= 99.5 },
      notes,
    };
  }
  private async tick(): Promise<void> {
    if (!this.running) return;
    const peers: PeerRtcSample[] = [];
    const connections = this.opts.getPeerConnections();
    const entries: Iterable<[string | number, RTCPeerConnection]> =
      connections instanceof Map ? connections.entries() : connections;
    for (const [id, pc] of entries) if (pc.connectionState !== "closed") peers.push(await samplePeer(String(id), pc));
    const local = this.opts.getLocalStream?.() ?? null;
    const live = (kind: "audio" | "video") => !!local?.getTracks().some(t => t.kind === kind && t.readyState === "live" && t.enabled);
    const sample: EnduranceSample = {
      ts: Date.now(), elapsedSec: Math.round((Date.now() - this.startedAt) / 1000),
      connectionLabel: this.opts.getConnectionLabel?.() ?? "unknown",
      health: health(this.opts.getConnectionLabel?.() ?? "unknown", peers),
      localAudioLive: live("audio"), localVideoLive: live("video"),
      remoteAudioPeers: peers.filter(p => (p.audioInbound?.packetsReceived ?? 0) > 0).length,
      remoteVideoPeers: peers.filter(p => (p.videoInbound?.framesDecoded ?? 0) > 0).length,
      reconnectCount: this.opts.getReconnectCount?.() ?? 0, peers,
    };
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    if (memory) { sample.jsHeapUsedMb = Math.round(memory.usedJSHeapSize / 104857.6) / 10; sample.jsHeapTotalMb = Math.round(memory.totalJSHeapSize / 104857.6) / 10; }
    this.samples.push(sample); this.opts.onSample?.(sample);
  }
}

export function downloadEnduranceReport(report: EnduranceReport, filename = "circle-endurance-report.json"): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}