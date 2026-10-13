// geotiff's fromBlob reads through FileReader, which browsers have and Node doesn't.
class BlobReader {
  result: ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  onabort: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then(
      (buf) => {
        this.result = buf;
        this.onload?.();
      },
      (err) => this.onerror?.(err)
    );
  }
  abort() {}
}
globalThis.FileReader ??= BlobReader as unknown as typeof FileReader;

export {};
