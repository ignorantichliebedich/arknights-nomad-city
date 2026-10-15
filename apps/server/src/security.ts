export const DEFAULT_LIMITS = {
  apiPerMinute: 180,
  roomsPerMinute: 20,
  connectionsPerMinute: 60,
  messagesPerMinute: 1200,
  maxConnections: 128,
  maxPerIp: 16,
  maxRooms: 1000,
  maxRoomCommands: 10000,
  maxQueuedPerRoom: 32,
  maxBufferedBytes: 1024 * 1024,
} as const;
export type SecurityLimits = { [Key in keyof typeof DEFAULT_LIMITS]: number };
export class SecurityRejection extends Error {
  status: number;
  constructor(status: number, message = "操作过于频繁，请稍后重试") {
    super(message);
    this.status = status;
  }
}
export class SecurityGate {
  readonly limits: SecurityLimits;
  private buckets = new Map<string, { count: number; until: number }>();
  private sockets = new Map<string, number>();
  private total = 0;
  constructor(limits: Partial<SecurityLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const [key, value] of Object.entries(this.limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error("Invalid security limit: " + key);
  }
  rate(key: string, limit: number) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (this.buckets.size >= 8192) {
        for (const [id, row] of this.buckets)
          if (row.until <= now) this.buckets.delete(id);
        if (!this.buckets.has(key) && this.buckets.size >= 8192)
          throw new SecurityRejection(429);
      }
      bucket = { count: 0, until: now + 60000 };
      this.buckets.set(key, bucket);
    }
    if (++bucket.count > limit) throw new SecurityRejection(429);
  }
  reserve(ip: string) {
    if (this.total >= this.limits.maxConnections)
      throw new SecurityRejection(503, "连接已满，请稍后重试");
    if ((this.sockets.get(ip) ?? 0) >= this.limits.maxPerIp)
      throw new SecurityRejection(
        429,
        "此网络的连接较多，请关闭多余页面后重试",
      );
    this.sockets.set(ip, (this.sockets.get(ip) ?? 0) + 1);
    this.total++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total--;
      const remaining = (this.sockets.get(ip) ?? 1) - 1;
      if (remaining > 0) this.sockets.set(ip, remaining);
      else this.sockets.delete(ip);
    };
  }
}
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), fullscreen=(self), autoplay=(self)",
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
} as const;
