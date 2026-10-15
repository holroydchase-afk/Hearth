// Read a local file (picker / manipulator output) as bytes, on iOS and Android.
import { File } from 'expo-file-system';

export async function readBytes(uri: string): Promise<Uint8Array> {
  if (uri.startsWith('data:') || uri.startsWith('blob:') || uri.startsWith('http')) {
    const r = await fetch(uri);
    return new Uint8Array(await r.arrayBuffer());
  }
  return new File(uri).bytes();
}
