import test from 'node:test';
import assert from 'node:assert/strict';
import { runPreviewQa } from './preview-qa.mjs';

test('Phase II.8 preview static QA passes accessibility, link, responsive and legacy checks', () => {
  const report = runPreviewQa();
  assert.equal(report.ok, true, report.issues.join('\n'));
  assert.equal(report.html_pages, 20);
  assert.ok(report.internal_links > 0);
  assert.ok(report.local_assets > 0);
});
