const PROMPT = 'ch> ';
const POLL_MS = 10;

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

export class SerialManager {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer = '';
  private loopActive = false;
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder();

  get isOpen() { return this.port !== null; }

  /** Opens Chrome's port-picker dialog and connects */
  async requestAndOpen(baudRate = 115200): Promise<void> {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate, bufferSize: 65536 });
    this.writer = this.port.writable!.getWriter();
    this.reader = this.port.readable!.getReader();
    this.buffer = '';
    this.loopActive = true;
    this.readLoop(); // fire-and-forget background pump
  }

  private async readLoop() {
    while (this.loopActive && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) { this.loopActive = false; break; }
        this.buffer += this.dec.decode(value);
      } catch {
        this.loopActive = false;
        break;
      }
    }
  }

  /** Wait until the NanoVNA prompt appears in the buffer, then return preceding text */
  async waitForPrompt(timeoutMs = 15_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const idx = this.buffer.indexOf(PROMPT);
      if (idx !== -1) {
        const text = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + PROMPT.length);
        return text;
      }
      await delay(POLL_MS);
    }
    throw new Error(`Serial timeout after ${timeoutMs} ms — no prompt received`);
  }

  /** Send a command and return everything up to the next prompt */
  async command(cmd: string, timeoutMs = 15_000): Promise<string> {
    if (!this.writer) throw new Error('Port not open');
    await this.writer.write(this.enc.encode(cmd + '\r'));
    return this.waitForPrompt(timeoutMs);
  }

  /** Flush any stale data sitting in the buffer */
  async flush(waitMs = 200): Promise<void> {
    await delay(waitMs);
    this.buffer = '';
  }

  async close(): Promise<void> {
    this.loopActive = false;
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { this.reader?.releaseLock(); } catch { /* ignore */ }
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    try { await this.port?.close(); } catch { /* ignore */ }
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.buffer = '';
  }
}
