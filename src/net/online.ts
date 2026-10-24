import Peer, { type DataConnection } from 'peerjs';
import { makeRoomCode, type Msg } from './protocol';

// 2台をつなぐ係。PeerJS の無料の取り次ぎサーバーで相手を見つけ、あとは2台が直接やりとりする。
// 場面（Scene）が変わってもつながったままにするため、1つだけ作って使い回す。

const ID_PREFIX = 'seirei-party-v1-';
const SILENCE_LIMIT = 8000; // これだけ相手から何も来なければ、切れたとみなす

export type Role = 'host' | 'guest';

export type OnlineError = 'no-room' | 'network' | 'busy';

class Online {
  role: Role | null = null;
  code = '';
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private listeners = new Set<(m: Msg) => void>();
  private closeListeners = new Set<() => void>();
  private lastHeard = 0;
  private watchdog = 0;

  get connected() {
    return !!this.conn?.open;
  }

  // へやを つくる。番号が決まったら onCode、相手が来たら onJoin
  host(onCode: (code: string) => void, onJoin: () => void, onError: (e: OnlineError) => void, tries = 0) {
    this.leave();
    this.role = 'host';
    const code = makeRoomCode();
    const peer = new Peer(ID_PREFIX + code);
    this.peer = peer;
    peer.on('open', () => {
      this.code = code;
      onCode(code);
    });
    peer.on('connection', (conn) => {
      if (this.conn) {
        conn.on('open', () => conn.close()); // 3人目はことわる
        return;
      }
      this.attach(conn, onJoin);
    });
    peer.on('error', (err) => {
      // 同じ番号のへやが先にあったら、べつの番号でやり直す
      if (err.type === 'unavailable-id' && tries < 5) {
        this.host(onCode, onJoin, onError, tries + 1);
        return;
      }
      if (this.conn) return;
      onError('network');
    });
  }

  // へやに はいる
  join(code: string, onJoin: () => void, onError: (e: OnlineError) => void) {
    this.leave();
    this.role = 'guest';
    this.code = code;
    const peer = new Peer();
    this.peer = peer;
    peer.on('open', () => {
      const conn = peer.connect(ID_PREFIX + code, { reliable: true });
      this.attach(conn, onJoin);
    });
    peer.on('error', (err) => {
      if (this.conn?.open) return;
      onError(err.type === 'peer-unavailable' ? 'no-room' : 'network');
    });
  }

  send(m: Msg) {
    if (this.conn?.open) this.conn.send(m);
  }

  // 受け取ったデータを聞く。もどり値を呼ぶと聞くのをやめる
  on(fn: (m: Msg) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onClose(fn: () => void): () => void {
    this.closeListeners.add(fn);
    return () => this.closeListeners.delete(fn);
  }

  leave() {
    window.clearInterval(this.watchdog);
    const conn = this.conn;
    this.conn = null;
    if (conn?.open) {
      conn.send({ t: 'bye' } satisfies Msg);
      // 「やめる」が届いてから切る
      window.setTimeout(() => conn.close(), 200);
    }
    const peer = this.peer;
    this.peer = null;
    if (peer) window.setTimeout(() => peer.destroy(), 300);
    this.role = null;
    this.code = '';
  }

  private attach(conn: DataConnection, onJoin: () => void) {
    this.conn = conn;
    conn.on('open', () => {
      this.lastHeard = Date.now();
      // 何も送るものがないときも、ときどき合図を送って、つながっていることを伝える
      window.clearInterval(this.watchdog);
      this.watchdog = window.setInterval(() => {
        this.send({ t: 'ping' });
        if (Date.now() - this.lastHeard > SILENCE_LIMIT) this.lost();
      }, 1000);
      onJoin();
    });
    conn.on('data', (data) => {
      this.lastHeard = Date.now();
      const m = data as Msg;
      if (m.t === 'ping') return;
      if (m.t === 'bye') {
        this.lost();
        return;
      }
      for (const fn of [...this.listeners]) fn(m);
    });
    conn.on('close', () => {
      if (this.conn === conn) this.lost();
    });
    conn.on('error', () => {
      if (this.conn === conn) this.lost();
    });
  }

  private lost() {
    if (!this.conn) return;
    window.clearInterval(this.watchdog);
    this.conn.close();
    this.conn = null;
    this.peer?.destroy();
    this.peer = null;
    this.role = null;
    for (const fn of [...this.closeListeners]) fn();
  }
}

export const online = new Online();
