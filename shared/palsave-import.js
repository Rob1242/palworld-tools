// Palworldセーブファイル(.sav)を解析し、所持パルの一覧を抽出するブラウザ用パーサー。
// アップロード不要・サーバー無し(GitHub Pagesの静的サイトの制約上、ブラウザ内で完結させる)。
//
// セーブは「PlZ(zlib圧縮)」または「PlM(Oodle圧縮、Palworld 0.6以降・1.0含む標準形式)」の
// 独自ヘッダー + Unreal Engineの「GVAS」プロパティツリー形式。Oodle解凍にはshared/oozwasm/
// (ooz-wasm、GPL-3.0、https://github.com/SnosMe/ooz-wasm)を使用。
//
// プロパティツリーの読み方はcheahjs/palworld-save-tools(MIT、
// https://github.com/cheahjs/palworld-save-tools )のarchive.py/gvas.py/rawdata/character.py
// のロジックを、必要な範囲(CharacterSaveParameterMapに到達するまでの経路)に絞ってJSに移植した。
// 経路外のMapProperty/SetProperty(拠点・ギルド・アイテムコンテナ等、今回は不要なデータ)は、
// 型ヒント無しでも安全な「サイズぶんだけ丸ごと読み飛ばす」方式にして、対応範囲を絞っている。

import { decompress as oozDecompress } from './oozwasm/index.js';

// ===== 低レベルバイナリリーダー =====
class BinReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
  }
  eof() { return this.pos >= this.bytes.length; }
  readBytes(n) {
    const b = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
  skip(n) { this.pos += n; }
  byte() { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  bool() { return this.byte() > 0; }
  i16() { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  u16() { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i32() { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  u32() { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  float() { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  double() { const v = this.view.getFloat64(this.pos, true); this.pos += 8; return v; }
  // i64/u64はセーブファイル中の実際の値が2^53を超えることは無いため、精度の範囲内でNumberとして扱う。
  i64() { const v = this.view.getBigInt64(this.pos, true); this.pos += 8; return Number(v); }
  u64() { const v = this.view.getBigUint64(this.pos, true); this.pos += 8; return Number(v); }
  guidBytes() { return this.readBytes(16); }
  optionalGuidBytes() { return this.bool() ? this.readBytes(16) : null; }
  fstring() {
    const size = this.i32();
    if (size === 0) return '';
    if (size < 0) {
      const n = -size;
      const bytes = this.readBytes(n * 2);
      return new TextDecoder('utf-16le').decode(bytes.subarray(0, bytes.length - 2));
    }
    const bytes = this.readBytes(size);
    return new TextDecoder('utf-8').decode(bytes.subarray(0, bytes.length - 1));
  }
}

function guidBytesToString(b) {
  if (!b) return null;
  const h = i => b[i].toString(16).padStart(2, '0');
  // cheahjs/palworld-save-tools archive.py の UUID.__str__ と同じバイト並び替え規則
  return (
    h(3) + h(2) + h(1) + h(0) + '-' +
    h(7) + h(6) + '-' +
    h(5) + h(4) + '-' +
    h(11) + h(10) + '-' +
    h(9) + h(8) + h(15) + h(14) + h(13) + h(12)
  );
}

// ===== GVASヘッダー(固定フォーマット、内容は使わないので読み飛ばすだけ) =====
function skipGvasHeader(r) {
  const magic = r.i32();
  if (magic !== 1396790855) throw new Error('GVASのマジックバイトが不正です(ファイルが破損しているか、対応していない形式です)');
  const saveGameVersion = r.i32();
  if (saveGameVersion !== 3) throw new Error(`未対応のsave_game_version: ${saveGameVersion}`);
  r.i32(); r.i32(); // package_file_version_ue4/ue5
  r.u16(); r.u16(); r.u16(); r.u32(); // engine version major/minor/patch/changelist
  r.fstring(); // engine_version_branch
  const customVersionFormat = r.i32();
  if (customVersionFormat !== 3) throw new Error(`未対応のcustom_version_format: ${customVersionFormat}`);
  const count = r.u32();
  for (let i = 0; i < count; i++) { r.guidBytes(); r.i32(); } // custom_versions(未使用)
  r.fstring(); // save_game_class_name
}

// ===== プロパティツリーの読み取り =====
// pathは常に絞り込みたい経路(CharacterSaveParameterMap)への到達判定にだけ使う。
const CHAR_MAP_PATH = '.worldSaveData.CharacterSaveParameterMap';
const CHAR_RAWDATA_PATH = CHAR_MAP_PATH + '.Value.RawData';

function readStructValue(r, structType, path) {
  switch (structType) {
    case 'Vector': return { x: r.double(), y: r.double(), z: r.double() };
    case 'Quat': return { x: r.double(), y: r.double(), z: r.double(), w: r.double() };
    case 'DateTime': return r.u64();
    case 'Guid': return guidBytesToString(r.guidBytes());
    case 'LinearColor': return { r: r.float(), g: r.float(), b: r.float(), a: r.float() };
    case 'Color': return { b: r.byte(), g: r.byte(), r: r.byte(), a: r.byte() };
    default:
      // 未知(または汎用)struct型: 名前付きプロパティの並びとして読む(GVASの標準的な既定動作)。
      return readPropertiesUntilEnd(r, path);
  }
}

function readArrayProperty(r, arrayType, path) {
  const count = r.u32();
  if (arrayType === 'StructProperty') {
    const propName = r.fstring();
    const propType = r.fstring();
    r.u64(); // 内側のサイズ(外側のsizeと重複する情報、使わない)
    const typeName = r.fstring();
    r.skip(16); // 配列全体の共通guid(未使用)
    r.skip(1);
    const values = [];
    for (let i = 0; i < count; i++) values.push(readStructValue(r, typeName, `${path}.${propName}`));
    return { propName, values };
  }
  if (arrayType === 'ByteProperty') {
    return { values: r.readBytes(count) };
  }
  const values = [];
  for (let i = 0; i < count; i++) {
    if (arrayType === 'EnumProperty' || arrayType === 'NameProperty' || arrayType === 'StrProperty') values.push(r.fstring());
    else if (arrayType === 'Guid') values.push(guidBytesToString(r.guidBytes()));
    else if (arrayType === 'IntProperty') values.push(r.i32());
    else throw new Error(`未対応のarray_type: ${arrayType} (${path})`);
  }
  return { values };
}

// パルの個体データ本体(CharacterSaveParameterMap.Value.RawData)専用デコーダ。
// cheahjs/palworld-save-tools の rawdata/character.py の character.decode/decode_bytes に相当。
function readCharacterRawData(r, path) {
  const arrayType = r.fstring(); // 'ByteProperty' のはず
  r.optionalGuidBytes();
  const count = r.u32();
  const charBytes = r.readBytes(count);
  const nested = new BinReader(charBytes);
  const object = readPropertiesUntilEnd(nested, path);
  // 末尾に unknown_bytes(4) + group_id(guid16) が続く仕様。ここは使わないので読み捨てるだけ。
  // 将来のゲームアップデートで内部形式が変わり、ぴったりEOFに届かないことがあっても
  // (パル個体データの取得自体は成功しているので)例外にせず、そのまま許容する。
  return { arrayType, object };
}

function readProperty(r, typeName, size, path) {
  if (path === CHAR_RAWDATA_PATH && typeName === 'ArrayProperty') {
    return { type: typeName, value: readCharacterRawData(r, path) };
  }
  switch (typeName) {
    case 'IntProperty': { r.optionalGuidBytes(); return { type: typeName, value: r.i32() }; }
    case 'UInt16Property': { r.optionalGuidBytes(); return { type: typeName, value: r.u16() }; }
    case 'UInt32Property': { r.optionalGuidBytes(); return { type: typeName, value: r.u32() }; }
    case 'UInt64Property': { r.optionalGuidBytes(); return { type: typeName, value: r.u64() }; }
    case 'Int64Property': { r.optionalGuidBytes(); return { type: typeName, value: r.i64() }; }
    case 'FixedPoint64Property': { r.optionalGuidBytes(); return { type: typeName, value: r.i32() }; }
    case 'FloatProperty': { r.optionalGuidBytes(); return { type: typeName, value: r.float() }; }
    case 'StrProperty': { r.optionalGuidBytes(); return { type: typeName, value: r.fstring() }; }
    case 'NameProperty': { r.optionalGuidBytes(); return { type: typeName, value: r.fstring() }; }
    case 'BoolProperty': { const v = r.bool(); r.optionalGuidBytes(); return { type: typeName, value: v }; }
    case 'EnumProperty': {
      const enumType = r.fstring(); r.optionalGuidBytes(); const v = r.fstring();
      return { type: typeName, value: { enumType, value: v } };
    }
    case 'ByteProperty': {
      const enumType = r.fstring(); r.optionalGuidBytes();
      const v = enumType === 'None' ? r.byte() : r.fstring();
      return { type: typeName, value: { enumType, value: v } };
    }
    case 'StructProperty': {
      const structType = r.fstring();
      r.skip(16); // struct_id(未使用)
      r.optionalGuidBytes();
      return { type: typeName, structType, value: readStructValue(r, structType, path) };
    }
    case 'ArrayProperty': {
      const arrayType = r.fstring(); r.optionalGuidBytes();
      return { type: typeName, arrayType, value: readArrayProperty(r, arrayType, path) };
    }
    case 'MapProperty': {
      const keyType = r.fstring(); const valueType = r.fstring(); r.optionalGuidBytes();
      if (path === CHAR_MAP_PATH) {
        r.u32(); // マップの内部バージョン値(常に0、未使用)
        const count = r.u32();
        const entries = [];
        for (let i = 0; i < count; i++) {
          const key = readPropertiesUntilEnd(r, path + '.Key'); // struct型は型ヒント不要な汎用フォールバックで安全に読める
          const value = readPropertiesUntilEnd(r, path + '.Value');
          entries.push({ key, value });
        }
        return { type: typeName, keyType, valueType, value: entries };
      }
      // 経路外のMap(拠点・ギルド・アイテムコンテナ等)は中身を解釈せず、サイズぶんだけ読み飛ばす。
      // MapProperty全体のバイト長は外側のsizeに正しく収まっているため、型ヒントが無くても安全。
      r.skip(size);
      return { type: typeName, skipped: true };
    }
    case 'SetProperty': {
      r.fstring(); r.optionalGuidBytes(); // set_type
      r.skip(size); // 使わないので常に読み飛ばす
      return { type: typeName, skipped: true };
    }
    default:
      throw new Error(`未対応のプロパティ型: ${typeName} (${path})`);
  }
}

function readPropertiesUntilEnd(r, path) {
  const props = {};
  while (true) {
    const name = r.fstring();
    if (name === 'None') break;
    const typeName = r.fstring();
    const size = r.u64();
    props[name] = readProperty(r, typeName, size, `${path}.${name}`);
  }
  return props;
}

// ===== 展開ロジック(PlZ=zlib / PlM=Oodle) =====
const MAGIC_PLZ = 'PlZ';
const MAGIC_PLM = 'PlM';

// 展開後サイズの上限。この機能は「友達から送られたセーブデータ」を開く前提なので、
// 圧縮爆弾(数百KBのファイルが数GBに膨らむ細工)を投げ込まれてもタブが落ちないよう、
// 現実的なセーブサイズから十分余裕を見た値で頭打ちにする。
// (実測: パル1036体・プレイヤー2人のセーブで展開後21MB。2026-08)
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

function tooLargeError(size) {
  return new Error(
    `展開後のサイズが大きすぎます(${Math.round(size / 1024 / 1024)}MB)。` +
    `Palworldのセーブデータではないか、壊れている可能性があります。`
  );
}

// 一気にArrayBufferへ流し込むと上限を超えた時点で気付けないため、
// チャンクごとに読みながら合計サイズを見張る。
async function zlibInflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const reader = new Blob([bytes]).stream().pipeThrough(ds).getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      await reader.cancel();
      throw tooLargeError(total);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

function bytesToAscii3(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
}

async function decompressSav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let uncompressedLen = view.getUint32(0, true);
  let compressedLen = view.getUint32(4, true);
  let magic = bytesToAscii3(bytes, 8);
  let saveType = bytes[11];
  let dataStart = 12;
  if (magic === 'CNK') {
    // Xboxコンテナ形式。ヘッダーがもう1段ネストしている。
    uncompressedLen = view.getUint32(12, true);
    compressedLen = view.getUint32(16, true);
    magic = bytesToAscii3(bytes, 20);
    saveType = bytes[23];
    dataStart = 24;
  }
  if (magic !== MAGIC_PLZ && magic !== MAGIC_PLM) {
    throw new Error(`未対応のセーブ形式です(マジックバイト: "${magic}")。Palworldのセーブファイルではない可能性があります。`);
  }
  if (saveType !== 0x31 && saveType !== 0x32) {
    throw new Error(`未対応の圧縮タイプです(save_type: 0x${saveType.toString(16)})`);
  }
  // Oodle側は宣言サイズがそのままメモリ確保に使われるため、展開前に弾く。
  if (uncompressedLen > MAX_UNCOMPRESSED_BYTES || compressedLen > MAX_UNCOMPRESSED_BYTES) {
    throw tooLargeError(Math.max(uncompressedLen, compressedLen));
  }
  const compressed = bytes.subarray(dataStart);
  const inflateOnce = magic === MAGIC_PLZ
    ? (buf, expectedLen) => zlibInflate(buf)
    : (buf, expectedLen) => Promise.resolve(oozDecompress(buf, expectedLen));

  if (saveType === 0x31) {
    return await inflateOnce(compressed, uncompressedLen);
  }
  // 0x32: 二重圧縮
  const intermediate = await inflateOnce(compressed, compressedLen);
  return await inflateOnce(intermediate, uncompressedLen);
}

// ===== 公開API =====

// CharacterSaveParameterMapの1エントリから、必要なフィールドだけを取り出す。
// Talent_HP等はIVが0-100に収まるためByteProperty({enumType:'None',value:N})で保存されている場合と、
// IntPropertyで生の数値のまま保存されている場合の両方があり得るため、どちらでも数値に正規化する。
function scalarNumber(propValue, fallback = 0) {
  if (propValue == null) return fallback;
  if (typeof propValue === 'number') return propValue;
  if (typeof propValue === 'object' && propValue.enumType === 'None' && typeof propValue.value === 'number') return propValue.value;
  return fallback;
}

function simplifyCharacterEntry(entryValueProps, entryKeyProps) {
  const sp = entryValueProps?.RawData?.value?.object?.SaveParameter?.value;
  if (!sp) return null;
  const keyPlayerUId = guidBytesToStringSafe(entryKeyProps?.PlayerUId?.value);
  // InstanceIdはゲーム内部でパル1体ごとに振られる一意なID。再インポート時に
  // 「同じ個体かどうか」を判定する安定キーとして使う(2026-08、重複防止対応)。
  const instanceId = guidBytesToStringSafe(entryKeyProps?.InstanceId?.value);
  const val = (name) => sp[name]?.value;
  const isPlayer = !!val('IsPlayer');
  const characterId = val('CharacterID') ?? null;
  const isAlpha = typeof characterId === 'string' && characterId.startsWith('BOSS_');
  const baseCharacterId = isAlpha ? characterId.slice('BOSS_'.length) : characterId;
  const genderRaw = sp['Gender']?.value?.value ?? null; // "EPalGenderType::Male" 等
  let sex = 'unknown';
  if (genderRaw === 'EPalGenderType::Male') sex = 'male';
  else if (genderRaw === 'EPalGenderType::Female') sex = 'female';
  const passiveNames = sp['PassiveSkillList']?.value?.values ?? [];
  const equipWaza = (sp['EquipWaza']?.value?.values ?? []).map(w => w.replace(/^EPalWazaID::/, ''));
  return {
    isPlayer,
    characterId: baseCharacterId,
    isAlpha,
    nickname: val('NickName') || '',
    level: sp['Level'] ? scalarNumber(val('Level'), null) : null,
    rank: sp['Rank'] ? scalarNumber(val('Rank'), null) : null,
    sex,
    talents: {
      hp: scalarNumber(val('Talent_HP')),
      melee: scalarNumber(val('Talent_Melee')),
      shot: scalarNumber(val('Talent_Shot')),
      defense: scalarNumber(val('Talent_Defense')),
    },
    passiveNames,
    equipWaza,
    ownerPlayerUId: guidBytesToStringSafe(sp['OwnerPlayerUId']?.value),
    keyPlayerUId,
    instanceId,
  };
}
function guidBytesToStringSafe(v) {
  // struct_value('Guid')は既に文字列化済みなのでそのまま返す
  return typeof v === 'string' ? v : null;
}

// 展開済み(平文)のGVASバイト列から直接パースする(テスト・デバッグ用に分離)。
export function parseFromRawGvas(gvasBytes) {
  const r = new BinReader(gvasBytes);
  skipGvasHeader(r);
  const properties = readPropertiesUntilEnd(r, '');
  const csm = properties?.worldSaveData?.value?.CharacterSaveParameterMap?.value;
  if (!Array.isArray(csm)) {
    throw new Error('CharacterSaveParameterMapが見つかりませんでした(Level.sav以外のファイルを選んでいませんか?)');
  }
  const players = [];
  const pals = [];
  for (const entry of csm) {
    const simplified = simplifyCharacterEntry(entry.value, entry.key);
    if (!simplified) continue;
    if (simplified.isPlayer) players.push(simplified);
    else pals.push(simplified);
  }
  return { players, pals };
}

/**
 * Palworldのセーブファイル(Level.sav)をブラウザ内で解析し、
 * プレイヤー・パルの簡易リストを返す。サーバーには一切送信しない。
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{players: Array, pals: Array}>}
 */
export async function parsePalworldSaveFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const gvasBytes = await decompressSav(bytes);
  return parseFromRawGvas(gvasBytes);
}

// ===== 簡易ZIP読み取り(友達から送られてくるバックアップzip対応) =====
// 中央ディレクトリ(End Of Central Directory)を末尾から探して一覧化する。
// 圧縮方式はSTORED(無圧縮)とDEFLATEのみ対応(Palworldのバックアップzipで使われる形式)。
const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CDFH_SIG = 0x02014b50;
const ZIP_LFH_SIG = 0x04034b50;

export function listZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let eocdPos = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--) {
    if (view.getUint32(i, true) === ZIP_EOCD_SIG) { eocdPos = i; break; }
  }
  if (eocdPos < 0) throw new Error('ZIPファイルとして認識できませんでした');
  const entryCount = view.getUint16(eocdPos + 10, true);
  const cdOffset = view.getUint32(eocdPos + 16, true);
  const entries = [];
  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pos, true) !== ZIP_CDFH_SIG) break;
    const compressionMethod = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function extractZipEntry(arrayBuffer, entry) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const pos = entry.localHeaderOffset;
  if (view.getUint32(pos, true) !== ZIP_LFH_SIG) throw new Error('ZIPのローカルヘッダーが不正です');
  const nameLen = view.getUint16(pos + 26, true);
  const extraLen = view.getUint16(pos + 28, true);
  const dataStart = pos + 30 + nameLen + extraLen;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressed; // STORED
  if (entry.compressionMethod === 8) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([compressed]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error(`未対応のZIP圧縮方式です(method: ${entry.compressionMethod})`);
}

if (typeof window !== 'undefined') {
  window.PalSaveImport = { parsePalworldSaveFile, listZipEntries, extractZipEntry };
}
