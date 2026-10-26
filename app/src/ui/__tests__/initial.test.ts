// UI-27: the avatar letter skips a leading "The", so "The Holroyds" shows "H", not "T".
import { initialOf } from '../format';

describe('UI-27 avatar initial', () => {
  it.each([
    ['The Holroyds', 'H'],
    ['the smiths', 'S'],
    ['Sam', 'S'],
    ['Theo', 'T'],
    ['  grandma Jo', 'G'],
    ['The', 'T'],
    ['', '?'],
  ])('UI-27 %p → %p', (name, want) => {
    expect(initialOf(name)).toBe(want);
  });
});
