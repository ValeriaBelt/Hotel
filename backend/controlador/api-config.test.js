const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'api-config.js'), 'utf8');

function loadApiUrl(location) {
    const window = { location };
    vm.runInNewContext(source, { window, URL });
    return window.hotelApiUrl('/api/admin/login');
}

test('uses the local HTTP API from Live Server without opening its HTTPS certificate', () => {
    assert.equal(
        loadApiUrl({ hostname: 'localhost', port: '5500', protocol: 'http:' }),
        'http://localhost:3000/api/admin/login'
    );
});

test('uses HTTPS when Hotel is served by its backend', () => {
    assert.equal(
        loadApiUrl({ hostname: 'localhost', port: '3443', protocol: 'https:' }),
        'https://localhost:3443/api/admin/login'
    );
});

test('uses the matching loopback address when Live Server uses IPv4', () => {
    assert.equal(
        loadApiUrl({ hostname: '127.0.0.1', port: '5500', protocol: 'http:' }),
        'http://127.0.0.1:3000/api/admin/login'
    );
});
