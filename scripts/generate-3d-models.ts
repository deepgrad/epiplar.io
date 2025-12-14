/**
 * Generate 3D models from product images using Tripo3D API
 * Usage: bun run scripts/generate-3d-models.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const TRIPO_API_KEY = 'tsk_FaAw-1aZSub5H1Ywva2p512yK2An4WmbeuQtMgZLtge';
const TRIPO_API_BASE = 'https://api.tripo3d.ai/v2/openapi';

interface CSVRow {
  asin: string;
  title: string;
  primary_image: string;
  brand: string;
}

interface TripoTaskResponse {
  code: number;
  data: {
    task_id: string;
  };
}

interface TripoTaskStatus {
  code: number;
  data: {
    task_id: string;
    status: 'queued' | 'running' | 'success' | 'failed';
    progress: number;
    output?: {
      model?: string;
      rendered_image?: string;
    };
  };
}

// Parse CSV (simple parser for this format)
function parseCSV(content: string): CSVRow[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  const asinIdx = headers.indexOf('asin');
  const titleIdx = headers.indexOf('title');
  const imageIdx = headers.indexOf('primary_image');
  const brandIdx = headers.indexOf('brand');

  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Handle CSV with quoted fields containing commas
    const row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());

    if (row[asinIdx] && row[imageIdx]) {
      rows.push({
        asin: row[asinIdx],
        title: row[titleIdx] || '',
        primary_image: row[imageIdx],
        brand: row[brandIdx] || '',
      });
    }
  }

  return rows;
}

// Create image-to-model task
async function createTask(imageUrl: string): Promise<string> {
  console.log(`  Creating task for image: ${imageUrl.substring(0, 50)}...`);

  const response = await fetch(`${TRIPO_API_BASE}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TRIPO_API_KEY}`,
    },
    body: JSON.stringify({
      type: 'image_to_model',
      file: {
        type: 'url',
        url: imageUrl,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create task: ${response.status} - ${error}`);
  }

  const data: TripoTaskResponse = await response.json();

  if (data.code !== 0) {
    throw new Error(`API error: ${JSON.stringify(data)}`);
  }

  return data.data.task_id;
}

// Poll task status until complete
async function waitForTask(taskId: string, maxWaitMs = 300000): Promise<string> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${TRIPO_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get task status: ${response.status}`);
    }

    const data: TripoTaskStatus = await response.json();

    if (data.code !== 0) {
      throw new Error(`API error: ${JSON.stringify(data)}`);
    }

    const { status, progress, output } = data.data;
    console.log(`  Status: ${status} (${progress}%)`);

    if (status === 'success' && output?.model) {
      return output.model;
    }

    if (status === 'failed') {
      throw new Error('Task failed');
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task timed out');
}

// Download GLB file
async function downloadGLB(url: string, outputPath: string): Promise<void> {
  console.log(`  Downloading GLB to: ${outputPath}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download GLB: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(buffer));

  console.log(`  Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
}

// Main function
async function main() {
  const projectRoot = process.cwd();
  const csvPath = join(projectRoot, 'data', 'sample.csv');
  const modelsDir = join(projectRoot, 'models');

  // Ensure models directory exists
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true });
  }

  // Read and parse CSV
  console.log('Reading sample.csv...');
  const csvContent = readFileSync(csvPath, 'utf-8');
  const products = parseCSV(csvContent);

  console.log(`Found ${products.length} products to process\n`);

  const results: { asin: string; title: string; success: boolean; error?: string }[] = [];

  for (const product of products) {
    console.log(`\nProcessing: ${product.title.substring(0, 50)}...`);
    console.log(`  ASIN: ${product.asin}`);

    try {
      // Create task
      const taskId = await createTask(product.primary_image);
      console.log(`  Task ID: ${taskId}`);

      // Wait for completion
      const modelUrl = await waitForTask(taskId);

      // Download GLB
      const outputPath = join(modelsDir, `${product.asin}.glb`);
      await downloadGLB(modelUrl, outputPath);

      results.push({ asin: product.asin, title: product.title, success: true });
      console.log(`  SUCCESS!`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED: ${errorMsg}`);
      results.push({ asin: product.asin, title: product.title, success: false, error: errorMsg });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total: ${results.length}`);
  console.log(`Success: ${successful}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed items:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.asin}: ${r.error}`);
    });
  }

  console.log(`\nGLB files saved to: ${modelsDir}`);
}

main().catch(console.error);
