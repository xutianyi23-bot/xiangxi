"""Decode a tiled HEIC primary image with a local HEVC decoder on older FFmpeg.
Used only when macOS ImageIO cannot produce readable pixels.
"""
import os
import sys
from pathlib import Path


class Reader:
    def __init__(self, data):
        self.data = memoryview(data)
        self.pos = 0

    def take(self, n):
        end = self.pos + n
        if n < 0 or end > len(self.data):
            raise ValueError("truncated image")
        part = self.data[self.pos:end]
        self.pos = end
        return part

    def num(self, n):
        return int.from_bytes(self.take(n), "big")

    def boxes(self):
        while self.pos < len(self.data):
            size, kind = self.num(4), bytes(self.take(4))
            if size == 0:
                yield kind, self.take(len(self.data) - self.pos)
                return
            if size == 1:
                yield kind, self.take(self.num(8) - 16)
                continue
            if size < 8:
                raise ValueError("unsupported box size")
            yield kind, self.take(size - 8)


def locations(data, file_data, inline):
    r = Reader(data)
    version, _flags = r.num(1), r.num(3)
    if version not in (0, 1, 2):
        raise ValueError("unsupported locations")
    sizes, extra = r.num(1), r.num(1)
    result = {}
    for _ in range(r.num(4 if version == 2 else 2)):
        item = r.num(4 if version == 2 else 2)
        method = r.num(2) & 15 if version else 0
        ref, base = r.num(2), r.num(extra >> 4)
        parts = []
        for _ in range(r.num(2)):
            if version:
                r.take(extra & 15)
            offset = base + r.num(sizes >> 4)
            length = r.num(sizes & 15)
            src = file_data if method == 0 else inline
            if method in (0, 1) and not ref and offset + length <= len(src):
                parts.append(src[offset:offset + length])
        result[item] = parts
    return result


def properties(data):
    boxes = dict(Reader(data).boxes())
    pool = [None] + list(Reader(boxes[b'ipco']).boxes())
    r = Reader(boxes[b'ipma'])
    version, flags = r.num(1), r.num(3)
    result = {}
    for _ in range(r.num(4)):
        item = r.num(4 if version else 2)
        props = {}
        for _ in range(r.num(1)):
            index = r.num(2 if flags & 1 else 1) & (32767 if flags & 1 else 127)
            if index:
                kind, value = pool[index]
                props[kind] = value
        result[item] = props
    return result


def parameter_sets(config):
    r = Reader(config)
    r.take(21)
    length_size = (r.num(1) & 3) + 1
    headers = []
    for _ in range(r.num(1)):
        r.take(1)
        for _ in range(r.num(2)):
            headers.append(r.take(r.num(2)))
    return length_size, headers


def decode(source, output, ffmpeg):
    if source.stat().st_size > 96 * 1024**2:
        raise ValueError("image too large")
    file_data = memoryview(source.read_bytes())
    meta = dict(Reader(dict(Reader(file_data).boxes())[b'meta'][4:]).boxes())
    primary = int.from_bytes(meta[b'pitm'][4:], 'big')
    parts = locations(meta[b'iloc'], file_data, meta.get(b'idat', b''))
    props = properties(meta[b'iprp'])
    ref = meta[b'iref']
    ids = []
    for kind, data in Reader(ref[4:]).boxes():
        r = Reader(data)
        size = 4 if ref[0] else 2
        if kind == b'dimg' and r.num(size) == primary:
            ids = [r.num(size) for _ in range(r.num(2))]
            break
    if sum(map(len, parts[primary])) > 12:
        raise ValueError("unsupported primary descriptor")
    grid = Reader(b''.join(parts[primary]))
    version, flags, rows, cols = grid.num(1), grid.num(1), grid.num(1)+1, grid.num(1)+1
    dimension_size = 4 if flags & 1 else 2
    width, height = grid.num(dimension_size), grid.num(dimension_size)
    if version or not (0 < len(ids) == rows*cols <= 256) or not (0 < width*height <= 64_000_000):
        raise ValueError("unsupported grid")
    if len(set(ids)) != len(ids) or sum(len(piece) for i in ids for piece in parts[i]) > len(file_data):
        raise ValueError("unsupported repeated or overlapping image data")
    tile_size = props[ids[0]][b'ispe']
    tile_width = int.from_bytes(tile_size[4:8], 'big')
    tile_height = int.from_bytes(tile_size[8:12], 'big')
    if not (0 < tile_width*tile_height*len(ids) <= 80_000_000):
        raise ValueError("unsupported tile dimensions")
    stream = output.with_suffix('.h265')
    start = b'\x00\x00\x00\x01'
    with stream.open('wb') as f:
        for item in ids:
            if props[item][b'ispe'] != tile_size:
                raise ValueError("inconsistent tiles")
            length_size, headers = parameter_sets(props[item][b'hvcC'])
            for header in headers:
                f.write(start)
                f.write(header)
            r = Reader(b''.join(parts[item]))
            while r.pos < len(r.data):
                nal = r.take(r.num(length_size))
                if not nal:
                    raise ValueError("empty HEVC unit")
                f.write(start)
                f.write(nal)
    rotation = props[primary].get(b'irot', b'\x00')[0] & 3
    filters = ['tile=%dx%d' % (cols,rows), 'crop=%d:%d:0:0' % (width,height)]
    filters += [[], ['transpose=cclock'], ['hflip','vflip'], ['transpose=clock']][rotation]
    filters.append('scale=2400:2400:force_original_aspect_ratio=decrease')
    os.execv(ffmpeg, [ffmpeg, '-nostdin', '-v', 'error', '-y', '-threads','1','-max_pixels','80000000','-f','hevc','-i',str(stream),
                      '-vf',','.join(filters),'-frames:v','1','-threads','1',str(output)])


if __name__ == '__main__':
    decode(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
