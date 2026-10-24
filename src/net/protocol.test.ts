import { describe, expect, it } from 'vitest';
import { RemoteInput, isRoomCode, makeRoomCode } from './protocol';

describe('RemoteInput', () => {
  it('押した回数が増えたときだけ、1回分の操作になる', () => {
    const r = new RemoteInput();
    r.receive({ t: 'in', l: true, r: false, d: false, j: 1, th: 0, b: 0 });
    expect(r.read()).toMatchObject({ left: true, jump: true, throw: false });
    expect(r.read()).toMatchObject({ left: true, jump: false });
    r.receive({ t: 'in', l: false, r: false, d: false, j: 1, th: 2, b: 0 });
    expect(r.read()).toMatchObject({ left: false, jump: false, throw: true });
  });
});

describe('へやばんごう', () => {
  it('4けたの数字になる', () => {
    expect(makeRoomCode(() => 0)).toBe('1000');
    expect(makeRoomCode(() => 0.9999)).toBe('9999');
    expect(isRoomCode('0123')).toBe(true);
    expect(isRoomCode('123')).toBe(false);
    expect(isRoomCode('12a4')).toBe(false);
  });
});
