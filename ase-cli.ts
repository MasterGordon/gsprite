import { parseArgs } from "util";
import sharp from "sharp";
import { AsepriteBuilder, type BuilderFrame } from "./ase-builder";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    merge: {
      type: "boolean",
      short: "m",
    },
    output: {
      type: "string",
      short: "o",
    },
    sheet: {
      type: "string",
      short: "s",
    },
    tags: {
      type: "string",
      short: "t",
    },
    width: {
      type: "string",
      short: "w",
    },
    height: {
      type: "string",
      short: "h",
    },
  },
  strict: true,
  allowPositionals: true,
});

async function loadPngAsFrame(
  filePath: string,
  width: number,
  height: number,
): Promise<BuilderFrame> {
  const sharpData = await sharp(filePath)
    .ensureAlpha()
    .toColorspace("srgb")
    .resize(width, height, { fit: "fill" })
    .raw({ depth: "uchar" })
    .toBuffer();

  const layerData: BuilderFrame["data"][number] = [];
  for (let i = 0; i < sharpData.length; i += 4) {
    layerData.push([
      sharpData[i]!,
      sharpData[i + 1]!,
      sharpData[i + 2]!,
      sharpData[i + 3]!,
    ]);
  }

  return { data: [layerData] };
}

function extractPrefix(filename: string): string {
  const basename = filename.split("/").pop()!.replace(/\.png$/i, "");
  // Match prefix before numbers at the end (e.g., "walk_01" -> "walk", "idle1" -> "idle")
  const match = basename.match(/^(.+?)[-_]?\d+$/);
  return match ? match[1]! : basename;
}

interface GroupedFile {
  prefix: string;
  files: string[];
}

function groupFilesByPrefix(files: string[]): GroupedFile[] {
  const groups = new Map<string, string[]>();

  for (const file of files) {
    const prefix = extractPrefix(file);
    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    groups.get(prefix)!.push(file);
  }

  // Sort files within each group naturally
  const result: GroupedFile[] = [];
  for (const [prefix, groupFiles] of groups) {
    groupFiles.sort((a, b) => {
      const numA = parseInt(a.match(/(\d+)\.png$/i)?.[1] ?? "0");
      const numB = parseInt(b.match(/(\d+)\.png$/i)?.[1] ?? "0");
      return numA - numB;
    });
    result.push({ prefix, files: groupFiles });
  }

  return result;
}

async function sheetToAseprite(
  sheetPath: string,
  tagsStr: string,
  outputFile: string,
  frameWidth?: number,
  frameHeight?: number,
) {
  const tagNames = tagsStr.split(",").flatMap((t) => {
    const trimmed = t.trim();
    const match = trimmed.match(/^(\d+)(.+)$/);
    if (match) {
      return Array(parseInt(match[1]!)).fill(match[2]!);
    }
    return [trimmed];
  });
  const totalFrames = tagNames.length;

  const meta = await sharp(sheetPath).metadata();
  const sheetWidth = meta.width!;
  const sheetHeight = meta.height!;

  // Infer frame dimensions if not provided
  const w = frameWidth ?? Math.floor(sheetWidth / totalFrames);
  const h = frameHeight ?? sheetHeight;

  const cols = Math.floor(sheetWidth / w);

  console.log(
    `Sheet: ${sheetPath} (${sheetWidth}x${sheetHeight}), frame: ${w}x${h}, ${totalFrames} frames`,
  );

  const builder = new AsepriteBuilder(w, h);
  builder.addLayer("Layer 1");

  // Group consecutive identical tag names
  let groupStart = 0;
  while (groupStart < tagNames.length) {
    const name = tagNames[groupStart]!;
    let groupEnd = groupStart;
    while (groupEnd + 1 < tagNames.length && tagNames[groupEnd + 1] === name) {
      groupEnd++;
    }

    console.log(
      `Tag: ${name} (frames ${groupStart}-${groupEnd}, ${groupEnd - groupStart + 1} frames)`,
    );
    builder.addTag(name);

    for (let i = groupStart; i <= groupEnd; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const sharpData = await sharp(sheetPath)
        .ensureAlpha()
        .toColorspace("srgb")
        .extract({
          left: col * w,
          top: row * h,
          width: w,
          height: h,
        })
        .raw({ depth: "uchar" })
        .toBuffer();

      const layerData: BuilderFrame["data"][number] = [];
      for (let j = 0; j < sharpData.length; j += 4) {
        layerData.push([
          sharpData[j]!,
          sharpData[j + 1]!,
          sharpData[j + 2]!,
          sharpData[j + 3]!,
        ]);
      }
      builder.addFrame({ data: [layerData] });
    }

    groupStart = groupEnd + 1;
  }

  await builder.write(outputFile);
  console.log(`Created ${outputFile} with ${totalFrames} frames`);
}

async function merge(outputFile: string, pngFiles: string[]) {
  if (pngFiles.length === 0) {
    console.error("Error: No PNG files provided");
    process.exit(1);
  }

  // Get dimensions from first image
  const firstMeta = await sharp(pngFiles[0]).metadata();
  const width = firstMeta.width!;
  const height = firstMeta.height!;

  console.log(`Creating ${outputFile} (${width}x${height})`);

  const builder = new AsepriteBuilder(width, height);
  builder.addLayer("Layer 1");

  const groups = groupFilesByPrefix(pngFiles);

  for (const group of groups) {
    console.log(`Tag: ${group.prefix} (${group.files.length} frames)`);
    builder.addTag(group.prefix);

    for (const file of group.files) {
      const frame = await loadPngAsFrame(file, width, height);
      builder.addFrame(frame);
    }
  }

  await builder.write(outputFile);
  console.log(`Merged ${pngFiles.length} files into ${outputFile}`);
}

// Main
if (values.sheet) {
  if (!values.tags) {
    console.error("Error: --tags (-t) is required with --sheet");
    process.exit(1);
  }
  const outputFile =
    values.output ?? values.sheet.replace(/\.png$/i, ".aseprite");
  const frameWidth = values.width ? parseInt(values.width) : undefined;
  const frameHeight = values.height ? parseInt(values.height) : undefined;
  await sheetToAseprite(
    values.sheet,
    values.tags,
    outputFile,
    frameWidth,
    frameHeight,
  );
} else if (values.merge) {
  const outputFile = values.output;
  if (!outputFile) {
    console.error("Error: --output (-o) is required with --merge");
    process.exit(1);
  }
  const pngFiles = positionals.filter((f) => f.endsWith(".png"));
  await merge(outputFile, pngFiles);
} else {
  console.log(`Usage:
  bun ase-cli.ts --merge -o output.aseprite *.png
  bun ase-cli.ts --sheet sprite.png --tags jump,jump,idle,idle,run,run

Options:
  --merge, -m       Merge multiple PNG files into a single Aseprite file
  --sheet, -s       Source sprite sheet PNG
  --tags, -t        Comma-separated tag per frame (required with --sheet)
  --width, -w       Frame width in pixels (default: sheet width / frame count)
  --height, -h      Frame height in pixels (default: sheet height)
  --output, -o      Output filename

Files with the same prefix are grouped into tags.
Example: walk_1.png, walk_2.png -> tag "walk" with 2 frames
`);
}
