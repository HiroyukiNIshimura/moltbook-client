import 'dotenv/config';
import { writeFileSync } from 'fs';

const log: string[] = [];
const addLog = (msg: string) => {
  log.push(msg);
  console.log(msg);
};

const key = process.env.MOLTBOOK_API_KEY?.trim();
addLog(`Testing API key: ${key?.slice(0, 20)}...`);
addLog(`Key length: ${key?.length}`);

// Test 2: Check /agents/me
addLog('\n--- Test: /agents/me ---');
try {
  const res2 = await fetch('https://www.moltbook.com/api/v1/agents/me', {
    headers: {
      'Authorization': `Bearer ${key}`,
    },
  });
  addLog(`Status: ${res2.status}`);
  const data2 = await res2.json();
  addLog(`Response: ${JSON.stringify(data2)}`);
} catch (e) {
  addLog(`Error: ${e}`);
}

// Save to file
writeFileSync('/tmp/api-test-result.txt', log.join('\n'));
addLog('\nSaved to /tmp/api-test-result.txt');
