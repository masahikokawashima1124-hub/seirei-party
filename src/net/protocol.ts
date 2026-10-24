// 2台で遊ぶときに送り合うデータの形。
// 親（へやを つくった人）がゲームを動かし、子（へやに はいった人）は操作を送って、画面の様子を受け取る。

export const PROTOCOL_VERSION = 1;

// 子 → 親：操作。jump / throw / bump は「押した回数」で送る（通信の合間に押して離しても取りこぼさない）
export interface InputMsg {
  t: 'in';
  l: boolean;
  r: boolean;
  d: boolean;
  j: number;
  th: number;
  b: number;
}

// 親 → 子：キャラ1人分の様子
export interface FighterSnap {
  x: number;
  y: number;
  f: 1 | -1; // 向き
  d: number; // ％
  s: number; // ふうせんの残り
  o: boolean; // 場外
  st: boolean; // ふっとび中
  inv: boolean; // むてき中
  g: boolean; // 地面の上
  sq: number; // 伸び縮み
}

export interface PillowSnap {
  id: number;
  x: number;
  y: number;
  r: number; // 回転
  sc: number;
}

// 演出（子の画面でも同じように出す）
export type FxEvent =
  | { t: 'hit'; x: number; y: number; w: string; i: number }
  | { t: 'poof'; x: number; y: number }
  | { t: 'ko'; x: number; y: number }
  | { t: 'ledge'; x: number; y: number }
  | { t: 'finish'; winner: number };

export interface SnapMsg {
  t: 'snap';
  f: FighterSnap[];
  p: PillowSnap[];
  e: FxEvent[];
}

export type Msg =
  | { t: 'hello'; v: number; char: string } // 子 → 親：はいったよ
  | { t: 'start'; p1: string; p2: string } // 親 → 子：はじめるよ
  | { t: 'again' } // もういちど あそびたい
  | { t: 'bye' } // やめる
  | { t: 'ping' }
  | InputMsg
  | SnapMsg;

// 子の操作を、親のゲームで使う形に直す
export interface Pressed {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  throw: boolean;
  bump: boolean;
}

export class RemoteInput {
  private latest: InputMsg = { t: 'in', l: false, r: false, d: false, j: 0, th: 0, b: 0 };
  private seen = { j: 0, th: 0, b: 0 };

  receive(m: InputMsg) {
    this.latest = m;
  }

  // 前に読んだときから回数が増えていれば「押した瞬間」
  read(): Pressed {
    const m = this.latest;
    const out: Pressed = {
      left: m.l,
      right: m.r,
      down: m.d,
      jump: m.j > this.seen.j,
      throw: m.th > this.seen.th,
      bump: m.b > this.seen.b,
    };
    this.seen = { j: m.j, th: m.th, b: m.b };
    return out;
  }
}

// へやばんごう（4けた）
export function makeRoomCode(rand = Math.random): string {
  return String(Math.floor(rand() * 9000) + 1000);
}

export function isRoomCode(s: string): boolean {
  return /^\d{4}$/.test(s);
}
