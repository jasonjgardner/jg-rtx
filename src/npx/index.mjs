#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/jasonjgardner/jg-rtx@main';
const BEDROCK_RP_PATH = 'bedrock/pack/RP';
const JAVA_PACK_PATH = 'java/pack';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function promptChoice(question, choices) {
  console.log(`\n${question}`);
  choices.forEach((choice, i) => {
    console.log(`  ${i + 1}. ${choice.label}${choice.description ? ` - ${choice.description}` : ''}`);
  });

  while (true) {
    const answer = await prompt(`Enter choice (1-${choices.length}): `);
    const index = parseInt(answer, 10) - 1;
    if (index >= 0 && index < choices.length) {
      return choices[index].value;
    }
    console.log('Invalid choice. Please try again.');
  }
}

function getBedrockPaths() {
  const appdata = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  return [
    {
      label: 'Minecraft Bedrock',
      path: join(appdata, 'Minecraft Bedrock', 'users', 'shared', 'games', 'com.mojang', 'resource_packs'),
    },
    {
      label: 'Minecraft Bedrock Preview',
      path: join(appdata, 'Minecraft Bedrock Preview', 'users', 'shared', 'games', 'com.mojang', 'resource_packs'),
    },
  ];
}

function createProgressBar(total) {
  let current = 0;
  const width = 40;

  return {
    increment() {
      current++;
      const percent = Math.round((current / total) * 100);
      const filled = Math.round((current / total) * width);
      const empty = width - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      process.stdout.write(`\r[${bar}] ${percent}% (${current}/${total})`);
    },
    finish() {
      process.stdout.write('\n');
    },
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function downloadFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, buffer);
}

async function getBedrockFileList() {
  const contentsUrl = `${CDN_BASE}/${BEDROCK_RP_PATH}/contents.json`;
  try {
    const contents = await fetchJson(contentsUrl);
    return contents.content.map((entry) => entry.path);
  } catch {
    console.log('contents.json not found, fetching file list from manifest...');
    const manifestUrl = `${CDN_BASE}/${BEDROCK_RP_PATH}/manifest.json`;
    await fetchJson(manifestUrl);
    throw new Error('Unable to determine file list. Please ensure contents.json exists in the repository.');
  }
}

async function getJavaFileList() {
  const listUrl = `${CDN_BASE}/${JAVA_PACK_PATH}/files.txt`;
  try {
    const response = await fetch(listUrl);
    if (!response.ok) throw new Error('files.txt not found');
    const text = await response.text();
    return text.split('\n').filter((line) => line.trim());
  } catch {
    console.log('\nNote: Java Edition file list not available.');
    console.log('For Java Edition, please download directly from:');
    console.log('https://github.com/jasonjgardner/jg-rtx/tree/main/java/pack\n');
    return null;
  }
}

async function installBedrock(variant) {
  console.log(`\nInstalling JG RTX (${variant}) for Bedrock Edition...\n`);

  const bedrockPaths = getBedrockPaths();
  const availablePaths = bedrockPaths.filter((p) => {
    const parentDir = dirname(p.path);
    return existsSync(parentDir);
  });

  if (availablePaths.length === 0) {
    console.log('No Minecraft Bedrock installation found.');
    console.log('Expected locations:');
    bedrockPaths.forEach((p) => console.log(`  - ${p.path}`));
    return;
  }

  const choices = availablePaths.map((p) => ({
    label: p.label,
    value: p.path,
    description: p.path,
  }));

  const installPath = await promptChoice('Select installation location:', choices);
  const packFolder = join(installPath, `JG-RTX-${variant}`);

  console.log(`\nFetching file list...`);
  const files = await getBedrockFileList();

  console.log(`Found ${files.length} files to download.`);
  console.log(`Installing to: ${packFolder}\n`);

  const progress = createProgressBar(files.length);
  let errors = 0;

  for (const file of files) {
    const fileUrl = `${CDN_BASE}/${BEDROCK_RP_PATH}/${file}`;
    const destPath = join(packFolder, file);

    try {
      await downloadFile(fileUrl, destPath);
    } catch {
      errors++;
    }
    progress.increment();
  }

  progress.finish();

  if (errors > 0) {
    console.log(`\nCompleted with ${errors} errors.`);
  } else {
    console.log(`\nSuccessfully installed JG RTX (${variant}) to:`);
    console.log(packFolder);
  }
}

async function installJava() {
  console.log('\nInstalling JG RTX for Java Edition...\n');

  const defaultPath = join(homedir(), 'Downloads', 'JG-RTX-Java');
  const inputPath = await prompt(`Enter installation path (default: ${defaultPath}): `);
  const installPath = inputPath || defaultPath;

  const files = await getJavaFileList();
  if (!files) {
    return;
  }

  console.log(`Found ${files.length} files to download.`);
  console.log(`Installing to: ${installPath}\n`);

  const progress = createProgressBar(files.length);
  let errors = 0;

  for (const file of files) {
    const fileUrl = `${CDN_BASE}/${JAVA_PACK_PATH}/${file}`;
    const destPath = join(installPath, file);

    try {
      await downloadFile(fileUrl, destPath);
    } catch {
      errors++;
    }
    progress.increment();
  }

  progress.finish();

  if (errors > 0) {
    console.log(`\nCompleted with ${errors} errors.`);
  } else {
    console.log(`\nSuccessfully installed JG RTX (Java) to:`);
    console.log(installPath);
  }
}

async function installMineways() {
  console.log('\nDownloading Mineways textures...\n');

  const defaultPath = process.cwd();
  const inputPath = await prompt(`Enter installation path (default: ${defaultPath}): `);
  const installPath = inputPath || defaultPath;

  console.log('Fetching file list...');
  const allFiles = await getBedrockFileList();

  const blockTextures = allFiles.filter((file) => {
    if (!file.startsWith('textures/blocks/')) return false;
    const ext = file.split('.').pop()?.toLowerCase();
    return ext === 'png' || ext === 'tga';
  });

  if (blockTextures.length === 0) {
    console.log('No block textures found.');
    return;
  }

  console.log(`Found ${blockTextures.length} block textures to download.`);
  console.log(`Installing to: ${installPath}\n`);

  const progress = createProgressBar(blockTextures.length);
  let errors = 0;

  for (const file of blockTextures) {
    const fileUrl = `${CDN_BASE}/${BEDROCK_RP_PATH}/${file}`;
    const destPath = join(installPath, file);

    try {
      await downloadFile(fileUrl, destPath);
    } catch {
      errors++;
    }
    progress.increment();
  }

  progress.finish();

  if (errors > 0) {
    console.log(`\nCompleted with ${errors} errors.`);
  } else {
    console.log(`\nSuccessfully downloaded Mineways textures to:`);
    console.log(join(installPath, 'textures', 'blocks'));
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║       JG RTX Resource Pack Installer       ║');
  console.log('╚════════════════════════════════════════╝');

  const edition = await promptChoice('Which edition would you like to install?', [
    { label: 'Bedrock Edition', value: 'bedrock', description: 'RTX & Vibrant Visuals support' },
    { label: 'Java Edition', value: 'java', description: 'Standard PBR textures' },
    { label: 'Mineways', value: 'mineways', description: 'Block textures only (.png/.tga)' },
  ]);

  if (edition === 'bedrock') {
    const variant = await promptChoice('Select rendering variant:', [
      { label: 'RTX', value: 'RTX', description: 'Full raytracing with MERS textures' },
      { label: 'Vibrant Visuals', value: 'VV', description: 'Stylized PBR without raytracing' },
    ]);
    await installBedrock(variant);
  } else if (edition === 'mineways') {
    await installMineways();
  } else {
    await installJava();
  }

  rl.close();
  console.log('\nThank you for using JG RTX!');
}

main().catch((err) => {
  console.error('\nInstallation failed:', err.message);
  rl.close();
  process.exit(1);
});
