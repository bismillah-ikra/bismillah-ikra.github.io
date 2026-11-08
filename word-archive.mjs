import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, deflateRawSync, inflateSync } from 'node:zlib';

// Rebuild the original Word package from deduplicated, losslessly stored entries.
export async function buildWord(entries, partsDirectory) {
  const files = await Promise.all(entries.map(async ([name, hash, prefix]) => {
    if (!/^[a-f0-9]{64}$/.test(hash) || !/^(?:[a-f0-9]{2})*$/.test(prefix)) throw new Error('Invalid Word archive');
    const data = Buffer.concat([Buffer.from(prefix, 'hex'), inflateSync(await readFile(join(partsDirectory, hash + '.z')))]);
    const compressed = deflateRawSync(data);
    const useCompression = compressed.length < data.length;
    return {
      name: Buffer.from(name, 'utf8'),
      body: useCompression ? compressed : data,
      size: data.length,
      method: useCompression ? 8 : 0,
      checksum: crc32(data)
    };
  }));
  const local = [], central = [];
  let offset = 0;
  for (const file of files) {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(file.method, 8);
    header.writeUInt32LE(file.checksum, 14); header.writeUInt32LE(file.body.length, 18); header.writeUInt32LE(file.size, 22); header.writeUInt16LE(file.name.length, 26);
    local.push(header, file.name, file.body);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(file.method, 10);
    directory.writeUInt32LE(file.checksum, 16); directory.writeUInt32LE(file.body.length, 20); directory.writeUInt32LE(file.size, 24); directory.writeUInt16LE(file.name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, file.name);
    offset += header.length + file.name.length + file.body.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
