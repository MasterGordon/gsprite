# gsprite

A small CLI (and library) for generating [Aseprite](https://www.aseprite.org/) files from PNGs. It writes the `.aseprite` binary format directly — no Aseprite installation required. Combine a folder of individual PNG frames or slice a sprite sheet into a single, tagged, animated Aseprite file.

## Features

- Merge multiple PNGs into one animated Aseprite file
- Slice a sprite sheet into frames
- Automatic frame grouping into animation **tags** (by filename prefix, or a per-frame tag list)
- Written in TypeScript for the [Bun](https://bun.com) runtime, using [sharp](https://sharp.pixelplumbing.com/) for image decoding

## Install

Install globally with [Bun](https://bun.com) to get the `gsprite` command on your `PATH`:

```bash
bun install -g gsprite
```

Or from a local clone:

```bash
bun install        # install dependencies
bun link           # expose `gsprite` globally
```

## Usage

```bash
gsprite [options] [files...]
```

### Merge PNG frames

Each PNG becomes a frame. Files are grouped into tags by their filename prefix (the trailing number is stripped), and sorted naturally within each group.

```bash
gsprite --merge -o character.aseprite walk_1.png walk_2.png idle_1.png
```

This produces `character.aseprite` with a `walk` tag (2 frames) and an `idle` tag (1 frame). All frames are resized to the dimensions of the first image.

### Slice a sprite sheet

Provide a sprite sheet and a per-frame tag list. Consecutive identical tag names are collapsed into a single animation tag.

```bash
gsprite --sheet sprite.png --tags jump,jump,idle,idle,run,run
```

The tag list also supports a shorthand count prefix, so the above is equivalent to:

```bash
gsprite --sheet sprite.png --tags "2jump,2idle,2run"
```

Frame size is inferred from the sheet width divided by the frame count (frame height defaults to the sheet height). Override with `--width` / `--height` for grid sheets with multiple rows.

## Options

| Option | Short | Description |
| --- | --- | --- |
| `--merge` | `-m` | Merge multiple PNG files into a single Aseprite file |
| `--sheet` | `-s` | Source sprite sheet PNG |
| `--tags` | `-t` | Comma-separated tag per frame (required with `--sheet`) |
| `--width` | `-w` | Frame width in pixels (default: sheet width / frame count) |
| `--height` | `-h` | Frame height in pixels (default: sheet height) |
| `--output` | `-o` | Output filename (required with `--merge`; defaults to the sheet name with an `.aseprite` extension for `--sheet`) |

## Library

The Aseprite writer is the package's entry point (`ase-builder.ts`), so you can build files programmatically by importing `gsprite` directly.

```ts
import { AsepriteBuilder } from "gsprite";

const builder = new AsepriteBuilder(16, 16);
builder.addLayer("Layer 1");
builder.addTag("idle");
builder.addFrame({ data: [pixels] }); // pixels: [r, g, b, a][] in row-major order
await builder.write("out.aseprite");
```

`RegionAsepriteBuilder` is also exported for building multi-layer animations by extracting frame regions from source sheets, with per-frame duration and horizontal flip (`f`) support.

---

Created with `bun init` on [Bun](https://bun.com) v1.3.0, a fast all-in-one JavaScript runtime.
