import sharp from "sharp";

class BunaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  offset: number;

  constructor(size: number) {
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }

  writeDWORD(value: number) {
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  writeWORD(value: number) {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  writeBYTE(value: number) {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  writeBYTES(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length; i++) {
      this.view.setUint8(this.offset + i, bytes[i]!);
    }
    this.offset += bytes.length;
  }

  writeZeroBYTES(count: number) {
    for (let i = 0; i < count; i++) {
      this.view.setUint8(this.offset + i, 0);
    }
    this.offset += count;
  }

  writeSHORT(value: number) {
    this.view.setInt16(this.offset, value, true);
    this.offset += 2;
  }

  writeSTRING(value: string) {
    const bytes = new TextEncoder().encode(value);
    this.writeWORD(bytes.length);
    this.writeBYTES(bytes);
  }

  /** A 32-bit fixed point (16.16) value */
  writeFixed(value: number) {
    const decimal = value.toString().split(".")[1];
    const integer = value.toString().split(".")[0];
    this.writeWORD(parseInt(integer!));
    this.writeWORD(parseInt(decimal!));
  }

  writePixel(r: number, g: number, b: number, a: number) {
    this.writeBYTE(r);
    this.writeBYTE(g);
    this.writeBYTE(b);
    this.writeBYTE(a);
  }

  getBuffer() {
    return this.buffer;
  }
}

class AsepriteFile {
  width = 16;
  height = 16;
  colorDepth: 32 | 16 | 8 = 32;
  flags: 0 | 1 = 1;
  speed = 100;
  transparentIndex = 0;
  numberOfColors = 1;
  pixelWidth = 1;
  pixelHeight = 1;
  gridX = 0;
  gridY = 0;
  gridWidth = 16;
  gridHeight = 16;
  frames: AsepriteFrame[] = [];

  getHeaderBuffer() {
    const writer = new BunaryWriter(124);
    writer.writeWORD(0xa5e0);
    writer.writeWORD(this.frames.length);
    writer.writeWORD(this.width);
    writer.writeWORD(this.height);
    writer.writeWORD(this.colorDepth);
    writer.writeDWORD(this.flags);
    writer.writeWORD(this.speed);
    writer.writeDWORD(0);
    writer.writeDWORD(0);
    // 0000 0020
    writer.writeBYTE(this.transparentIndex);
    writer.writeZeroBYTES(3);
    writer.writeWORD(this.numberOfColors);
    writer.writeBYTE(this.pixelWidth);
    writer.writeBYTE(this.pixelHeight);
    writer.writeSHORT(this.gridX);
    writer.writeSHORT(this.gridY);
    writer.writeWORD(this.gridWidth);
    writer.writeWORD(this.gridHeight);
    writer.writeZeroBYTES(84);
    return writer.getBuffer();
  }

  getBuffer() {
    const headerBuffer = this.getHeaderBuffer();
    const frameBuffers = this.frames.map((frame) => frame.getBuffer());
    const frameSize = frameBuffers.reduce(
      (acc, frame) => acc + frame.byteLength,
      0,
    );
    const writer = new BunaryWriter(headerBuffer.byteLength + frameSize + 4);
    writer.writeDWORD(frameSize + headerBuffer.byteLength + 4);
    writer.writeBYTES(new Uint8Array(headerBuffer));
    frameBuffers.forEach((frame) => writer.writeBYTES(new Uint8Array(frame)));
    return writer.getBuffer();
  }
}

abstract class AsepriteFrameChunk {
  abstract getBuffer(): ArrayBuffer;
}

class AsepriteFrame {
  frameDuration = 100;
  chunks: AsepriteFrameChunk[] = [];

  getBuffer() {
    const chunkBuffers: ArrayBuffer[] = this.chunks.map((chunk) =>
      chunk.getBuffer(),
    );
    const frameSize = chunkBuffers.reduce(
      (acc, chunk) => acc + chunk.byteLength,
      0,
    );
    const writer = new BunaryWriter(16 + frameSize);
    writer.writeDWORD(frameSize + 16);
    writer.writeWORD(0xf1fa);
    writer.writeWORD(chunkBuffers.length);
    writer.writeWORD(this.frameDuration);
    writer.writeZeroBYTES(2);
    writer.writeDWORD(chunkBuffers.length);
    chunkBuffers.forEach((chunk) => writer.writeBYTES(new Uint8Array(chunk)));
    return writer.getBuffer();
  }
}

enum BlendMode {
  Normal = 0,
  Multiply = 1,
  Screen = 2,
  Overlay = 3,
  Darken = 4,
  Lighten = 5,
  ColorDodge = 6,
  ColorBurn = 7,
  HardLight = 8,
  SoftLight = 9,
  Difference = 10,
  Exclusion = 11,
  Hue = 12,
  Saturation = 13,
  Color = 14,
  Luminosity = 15,
  Addition = 16,
  Subtract = 17,
  Divide = 18,
}

enum LayerFlag {
  Visible = 0x01,
  Editable = 0x02,
  LockMovement = 0x04,
  Background = 0x08,
  PreferLinked = 0x10,
  LayerGroupDisplayedCollapsed = 0x20,
  ReferenceLayer = 0x40,
}

enum LayerType {
  Normal = 0,
  Group = 1,
  Tilemap = 2,
}

class LayerChunk extends AsepriteFrameChunk {
  chunkType = 0x2004;
  flags: LayerFlag = LayerFlag.Visible | LayerFlag.Editable;
  type: LayerType = LayerType.Normal;
  childLevel = 0;
  defaultLayerWidth = 0;
  defaultLayerHeight = 0;
  blendMode: BlendMode = BlendMode.Normal;
  opacity = 255;
  name = "Unnamed";
  tilesetIndex = 0;

  getBuffer() {
    const byteSize =
      24 + this.name.length + (this.type & LayerType.Tilemap ? 2 : 0);

    const writer = new BunaryWriter(byteSize);
    writer.writeDWORD(byteSize);
    writer.writeWORD(this.chunkType);
    writer.writeWORD(this.flags);
    writer.writeWORD(this.type);
    writer.writeWORD(this.childLevel);
    writer.writeWORD(this.defaultLayerWidth);
    writer.writeWORD(this.defaultLayerHeight);
    writer.writeWORD(this.blendMode);
    writer.writeBYTE(this.opacity);
    writer.writeZeroBYTES(3);
    writer.writeSTRING(this.name);
    if (this.type & LayerType.Tilemap) {
      writer.writeWORD(this.tilesetIndex);
    }

    return writer.getBuffer();
  }
}

enum ColorProfileType {
  NoColorProfile = 0,
  SRGB = 1,
  EmbeddedICC = 2,
}

class ColorProfileChunk extends AsepriteFrameChunk {
  chunkType = 0x2007;
  type: ColorProfileType = ColorProfileType.SRGB;
  /** 1 = use special fixed gamma */
  flags: 0 | 1 = 0;
  fixedGamma = 0;

  getBuffer() {
    const writer = new BunaryWriter(22);
    writer.writeDWORD(22);
    writer.writeWORD(this.chunkType);
    writer.writeWORD(this.type);
    writer.writeWORD(this.flags);
    writer.writeFixed(this.fixedGamma);
    writer.writeZeroBYTES(8);
    return writer.getBuffer();
  }
}

class CelChunk extends AsepriteFrameChunk {
  layerIndex = 0;
  x = 0;
  y = 0;
  opacity = 255;
  cellType = 0;
  zIndex = 0;
  width = 0;
  height = 0;
  pixels: [number, number, number, number][] = [];

  getBuffer() {
    const writer = new BunaryWriter(this.width * this.height * 4 + 26);
    writer.writeDWORD(this.pixels.length * 4 + 26);
    writer.writeWORD(0x2005);
    writer.writeWORD(this.layerIndex);
    writer.writeSHORT(this.x);
    writer.writeSHORT(this.y);
    writer.writeBYTE(this.opacity);
    writer.writeWORD(this.cellType);
    writer.writeWORD(this.zIndex);
    writer.writeZeroBYTES(5);
    writer.writeWORD(this.width);
    writer.writeWORD(this.height);
    for (let i = 0; i < this.width * this.height; i++) {
      const [r, g, b, a] = this.pixels[i] || [0, 0, 0, 0];
      writer.writePixel(r, g, b, a);
    }
    return writer.getBuffer();
  }
}

enum TagDirection {
  Forward = 0,
  Backward = 1,
  PingPong = 2,
  PingPongBackward = 3,
}

interface Tag {
  from: number;
  to: number;
  name: string;
  direction: TagDirection;
  /** Repeat N times. Play this animation section N times. Infinite when value is 0 */
  repeat: number;
}

class TagsChunk extends AsepriteFrameChunk {
  tags: Tag[] = [];

  getBuffer() {
    const tagsSize = this.tags.reduce(
      (acc, tag) => acc + tag.name.length + 4 + 17,
      0,
    );
    const size = 10 + tagsSize + 6;
    const writer = new BunaryWriter(size);
    writer.writeDWORD(size);
    writer.writeWORD(0x2018);
    writer.writeWORD(this.tags.length);
    writer.writeZeroBYTES(8);
    for (const tag of this.tags) {
      writer.writeWORD(tag.from);
      writer.writeWORD(tag.to);
      writer.writeBYTE(tag.direction);
      writer.writeWORD(tag.repeat);
      writer.writeZeroBYTES(6);
      writer.writeZeroBYTES(3);
      writer.writeZeroBYTES(1);
      writer.writeSTRING(tag.name);
    }
    return writer.getBuffer();
  }
}

export interface BuilderFrame {
  data: [number, number, number, number][][];
  duration?: number;
}

export interface BuilderTag {
  name: string;
  from: number;
  to: number;
  repeat: number;
}

export class AsepriteBuilder {
  protected width: number;
  protected height: number;
  protected layers: string[] = [];
  protected frames: BuilderFrame[] = [];
  protected tags: BuilderTag[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  public addLayer(layerName: string) {
    this.layers.push(layerName);
    return this;
  }

  public addFrame(frame: BuilderFrame) {
    if (this.tags.length > 0) {
      const tag = this.tags.at(-1)!;
      if (tag.from == -1) {
        tag.from = this.frames.length;
      }
      tag.to = this.frames.length;
    }
    this.frames.push(frame);
    return this;
  }

  public addTag(name: string, repeat = 0) {
    this.tags.push({
      name,
      repeat,
      from: -1,
      to: -1,
    });
    return this;
  }

  public build(): ArrayBuffer {
    const file = new AsepriteFile();
    file.width = this.width;
    file.height = this.height;
    if (this.frames.length == 0) {
      throw new Error("Can't create file without frames");
    }
    if (this.layers.length == 0) {
      throw new Error("Can't create file without layers");
    }
    this.frames.forEach((frame, i) => {
      const fileFrame = new AsepriteFrame();
      if (frame.duration) {
        fileFrame.frameDuration = frame.duration;
      }
      file.frames.push(fileFrame);
      if (i == 0) {
        this.layers.forEach((l) => {
          const layer = new LayerChunk();
          layer.name = l;
          fileFrame.chunks.push(layer);
        });
        const tags = new TagsChunk();
        tags.tags.push(
          ...this.tags.map<Tag>((tag) => ({
            ...tag,
            direction: TagDirection.Forward,
          })),
        );
        if (tags.tags.length > 0) fileFrame.chunks.push(tags);
      }
      fileFrame.chunks.push(new ColorProfileChunk());
      frame.data.forEach((layer, layerIndex) => {
        const cel = new CelChunk();
        cel.layerIndex = layerIndex;
        cel.x = 0;
        cel.y = 0;
        cel.width = this.width;
        cel.height = this.height;
        cel.pixels = layer;
        fileFrame.chunks.push(cel);
      });
    });

    return file.getBuffer();
  }

  public async write(fileName: string) {
    const start = performance.now();
    await Bun.write(fileName, this.build());
    console.log(
      `Written ${fileName} in ${Math.floor(performance.now() - start)}ms`,
    );
  }
}

export class RegionAsepriteBuilder extends AsepriteBuilder {
  private files: string[] = [];
  private sourceWidth: number = -1;
  private sourceHeight: number = -1;

  constructor(width: number, height: number, layers: Record<string, string>) {
    super(width, height);
    Object.entries(layers).forEach(([name, file]) => {
      this.addLayer(name);
      this.files.push(file);
    });
  }

  public async prepare() {
    const meta = await sharp(this.files[0]).metadata();
    this.sourceWidth = meta.width;
    this.sourceHeight = meta.height;
  }

  public async addAnimation(
    frames: (
      | `${number}`
      | `${number}f`
      | `${number}@${number}`
      | `${number}f@${number}`
    )[],
    name: string,
  ) {
    const start = performance.now();
    const rowLength = this.sourceWidth / this.width;
    this.addTag(name);
    for (const frameInfo of frames) {
      const currentFrameData: BuilderFrame["data"] = [];
      const [frameNumber, duration] = frameInfo.includes("@")
        ? frameInfo.split("@")
        : [frameInfo, "100"];
      for (const file of this.files) {
        const layerData: BuilderFrame["data"][number] = [];
        currentFrameData.push(layerData);
        const f = sharp(file).ensureAlpha().toColorspace("srgb");
        const frame = parseInt(frameNumber!);
        f.extract({
          left: (frame % rowLength) * this.width,
          top: Math.floor(frame / rowLength) * this.height,
          width: this.width,
          height: this.height,
        });
        if (frameNumber!.includes("f")) {
          f.flop();
        }
        const sharpData = await f.raw({ depth: "uchar" }).toBuffer();
        for (let i = 0; i < sharpData.length; i += 4) {
          layerData.push([
            sharpData[i]!,
            sharpData[i + 1]!,
            sharpData[i + 2]!,
            sharpData[i + 3]!,
          ]);
        }
      }
      this.addFrame({ data: currentFrameData, duration: parseInt(duration!) });
    }
    console.log(`Added ${name} in ${Math.floor(performance.now() - start)}ms`);
  }
}
