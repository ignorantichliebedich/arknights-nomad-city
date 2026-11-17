/** Independent, mutable reference decoder used only by browser game drivers. */
export function observeSocket() {
  const NativeSocket = window.WebSocket;
  class ObservedSocket extends NativeSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      (window as any).__gameSocket = this;
      let room: any = null;
      let sequence: number | null = null;
      this.addEventListener("message", (event) => {
        if ((window as any).__gameSocket !== this) return;
        const message = JSON.parse(event.data);
        if (message.type === "state") {
          room = message.room;
          sequence = message.sync?.sequence ?? null;
        } else if (message.type === "state-delta") {
          if (!room || message.base !== sequence)
            throw new Error("Browser driver missed a state frame");
          room = structuredClone(room);
          for (const [op, path, value, items] of message.changes) {
            let target = room;
            for (const key of path.slice(0, -1)) target = target[key];
            const key = path.at(-1);
            if (op === "set") {
              if (path.length) target[key] = value;
              else room = value;
            } else if (op === "remove") delete target[key];
            else if (op === "append") {
              const list = path.length ? target[key] : room;
              if (list.length !== value)
                throw new Error("Invalid append baseline");
              list.push(...items);
            }
          }
          sequence = message.sequence;
        } else return;
        (window as any).__gameRoom = room;
      });
    }
  }
  window.WebSocket = ObservedSocket;
}
