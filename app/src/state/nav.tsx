import { createContext, useContext } from 'react';

/** Navigation as the screens see it. The app wires it to expo-router; tests pass spies. */
export interface Nav {
  openViewer(postId: string, mediaIndex: number): void;
  close(): void;
  goPhotos(): void;
  goSignIn(): void;
  /** Open an invite by its code (BETA-JOIN-8). */
  goJoin(code: string): void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('NavContext missing');
  return n;
}
