import path from 'node:path';
import { Glob } from 'bun';

const CWD = process.cwd();
const RP_DIR = path.resolve(CWD, 'bedrock/pack/RP');
const OUTPUT_FILE = path.join(RP_DIR, 'contents.json');

interface ContentEntry {
  path: string;
}

interface ContentsJson {
  content: ContentEntry[];
}

async function generateContentsJson(): Promise<void> {
  console.log('Scanning directory:', RP_DIR);

  const glob = new Glob('**/*');
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: RP_DIR, onlyFiles: true })) {
    if (file !== 'contents.json') {
      files.push(file.replace(/\\/g, '/'));
    }
  }

  files.sort((a, b) => a.localeCompare(b));

  const contents: ContentsJson = {
    content: files.map((file) => ({ path: file })),
  };

  await Bun.write(OUTPUT_FILE, JSON.stringify(contents, null, 2));

  console.log(`Generated contents.json with ${contents.content.length} entries`);
  console.log('Output:', OUTPUT_FILE);
}

generateContentsJson().catch((err) => {
  console.error('Failed to generate contents.json:', err);
  process.exit(1);
});
