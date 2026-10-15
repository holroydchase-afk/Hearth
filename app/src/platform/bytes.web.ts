export async function readBytes(uri: string): Promise<Uint8Array> {
  const r = await fetch(uri);
  return new Uint8Array(await r.arrayBuffer());
}
