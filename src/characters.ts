// 出場するキャラクター。設定は まなびめぐる の character-bible.md に合わせる。
// 画像は scripts/extract-sprites.mjs で public/assets/chars/<id>.png に作る。

export interface CharacterDef {
  id: string;
  name: string;
  catchphrase: string;
  color: number; // 名前の帯などに使うテーマ色
  facesLeft: boolean; // 元画像が左向きなら true
  height: number; // 画面上の高さ(px)
  speed: number; // 横移動の速さ
  jump: number; // ジャンプの強さ
  weight: number; // 重いほど飛ばされにくい（1が標準）
  pillowSize: number; // まくらの大きさ（1が標準）
  throwCooldown: number; // まくらを投げる間隔(ms)
  trait: string; // キャラ選びで見せる一言
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'hanabi',
    name: 'はなびのこびと',
    catchphrase: 'いちばんのり！',
    color: 0xff8a3d,
    facesLeft: true,
    height: 104,
    speed: 430,
    jump: 760,
    weight: 0.85,
    pillowSize: 0.9,
    throwCooldown: 420,
    trait: 'あしが はやい',
  },
  {
    id: 'natsu-king',
    name: 'なつぞらのおうさま',
    catchphrase: 'ことしも、はじまるよ',
    color: 0xffc94d,
    facesLeft: false,
    height: 116,
    speed: 360,
    jump: 740,
    weight: 1,
    pillowSize: 1,
    throwCooldown: 450,
    trait: 'バランスが いい',
  },
  {
    id: 'aki-king',
    name: 'あきぞらのおうさま',
    catchphrase: 'もう、いいんだよ',
    color: 0xe0612b,
    facesLeft: false,
    height: 122,
    speed: 310,
    jump: 700,
    weight: 1.3,
    pillowSize: 1.05,
    throwCooldown: 500,
    trait: 'とばされにくい',
  },
  {
    id: 'fuyu-king',
    name: 'ふゆぞらのおうさま',
    catchphrase: '……おやすみ',
    color: 0x8fc8ff,
    facesLeft: false,
    height: 120,
    speed: 330,
    jump: 720,
    weight: 1.1,
    pillowSize: 1.35,
    throwCooldown: 600,
    trait: 'まくらが おおきい',
  },
  {
    id: 'haru-king',
    name: 'はるぞらのおうさま',
    catchphrase: 'もう、はるだよ！',
    color: 0xffd23f,
    facesLeft: false,
    height: 118,
    speed: 370,
    jump: 820,
    weight: 0.95,
    pillowSize: 0.95,
    throwCooldown: 340,
    trait: 'ジャンプが たかい',
  },
];

export const getCharacter = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
