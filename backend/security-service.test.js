const assert = require('node:assert/strict');
const test = require('node:test');
const {
    decryptSecret,
    encryptSecret,
    generateTotpCode,
    hashPassword,
    signAuditEvent,
    verifyAuditEvent,
    verifyPassword,
    verifyTotp
} = require('./security-service');

test('verifies RFC 6238 SHA-1 TOTP values', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const timestamp = 59000;
    const code = generateTotpCode(secret, timestamp);

    assert.equal(code, '287082');
    assert.equal(verifyTotp(secret, code, timestamp), true);
    assert.equal(verifyTotp(secret, '000000', timestamp), false);
});

test('hashes passwords and upgrades legacy plaintext values', async () => {
    const hash = await hashPassword('correct horse battery staple');

    assert.match(hash, /^pbkdf2-sha256\$/);
    assert.deepEqual(await verifyPassword('correct horse battery staple', hash), {
        valid: true,
        needsUpgrade: false
    });
    assert.deepEqual(await verifyPassword('wrong password', hash), {
        valid: false,
        needsUpgrade: false
    });
    assert.deepEqual(await verifyPassword('legacy password', 'legacy password'), {
        valid: true,
        needsUpgrade: true
    });
});

test('encrypts MFA secrets and authenticates audit entries', () => {
    const key = Buffer.alloc(32, 7);
    const secret = 'JBSWY3DPEHPK3PXP';
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const auditEvent = {
        AdminId: 17,
        EventType: 'admin.login.success',
        Details: 'MFA verificado',
        TargetProfile: 'Test Admin (admin@example.test)',
        CreatedAt: createdAt,
        Signature: signAuditEvent(
            17,
            'admin.login.success',
            'MFA verificado',
            createdAt,
            key,
            'Test Admin (admin@example.test)'
        )
    };
    const encrypted = encryptSecret(secret, key);

    assert.equal(decryptSecret(encrypted, key), secret);
    assert.equal(verifyAuditEvent(auditEvent, key), true);
    assert.equal(verifyAuditEvent({ ...auditEvent, Details: 'Modificado' }, key), false);
    assert.equal(verifyAuditEvent({ ...auditEvent, TargetProfile: 'Otro perfil' }, key), false);
    const legacyEvent = {
        AdminId: 17,
        EventType: 'admin.logout',
        Details: 'Sesión cerrada',
        CreatedAt: createdAt,
        Signature: signAuditEvent(17, 'admin.logout', 'Sesión cerrada', createdAt, key)
    };
    assert.equal(verifyAuditEvent(legacyEvent, key), true);
    const [nonce, tag, ciphertext] = encrypted.split('.');
    const alteredCiphertext = Buffer.from(ciphertext, 'base64');
    alteredCiphertext[0] ^= 1;
    assert.throws(() => decryptSecret(
        `${nonce}.${tag}.${alteredCiphertext.toString('base64')}`,
        key
    ));
});
