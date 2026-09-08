const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const widget = fs.readFileSync(path.join(root, 'packages/react/src/components/ramp-widget/RampWidget.tsx'), 'utf8');
const template = fs.readFileSync(path.join(root, 'packages/react/src/components/ramp-widget/RampWidgetTemplate.tsx'), 'utf8');
const route = fs.readFileSync(path.join(root, 'packages/react/src/components/ramp-widget/RouteDisplay.tsx'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'packages/core/src/api/schema.d.ts'), 'utf8');

assert.match(schema, /txHash\?: string;\s+chain\?: "STELLAR" \| "POLYGON" \| "SOLANA";/);
assert.match(widget, /SDK_RAMPS_MESADEPAGOS_ERROR/);
assert.match(widget, /'amoy\.'/);
assert.match(widget, /polygonscan\.com\/tx\/\$\{txHash\}/);
assert.match(widget, /!txHash && !kycPending/);
assert.match(template, /depositInstructions\.scannable/);
assert.match(template, /f\.type === 'select'/);
assert.match(route, /QR: 'Bank QR'/);
assert.match(route, /ACH: 'ACH \(bank transfer\)'/);

console.log('Mesa SDK/widget smoke checks passed.');
