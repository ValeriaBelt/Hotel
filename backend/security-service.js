const {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    pbkdf2,
    randomBytes,
    timingSafeEqual
} = require('node:crypto');
const { promisify } = require('node:util');

const deriveKey = promisify(pbkdf2);
const passwordIterations = 120000;
const passwordScheme = 'pbkdf2-sha256';

function encodeBase32(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let bits = 0;
    let value = 0;

    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            result += alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        result += alphabet[(value << (5 - bits)) & 31];
    }

    return result;
}

function decodeBase32(value) {
    const normalized = value.replace(/=+$/, '').toUpperCase();
    if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) {
        throw new Error('Invalid Base32 secret.');
    }

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = [];
    let bits = 0;
    let accumulator = 0;

    for (const character of normalized) {
        accumulator = (accumulator << 5) | alphabet.indexOf(character);
        bits += 5;
        if (bits >= 8) {
            bytes.push((accumulator >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(bytes);
}

function generateTotpSecret() {
    return encodeBase32(randomBytes(20));
}

function generateTotpCode(secret, timestamp = Date.now()) {
    const counter = Math.floor(timestamp / 30000);
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', decodeBase32(secret)).update(counterBytes).digest();
    const offset = digest[digest.length - 1] & 15;
    const binaryCode =
        ((digest[offset] & 127) << 24) |
        ((digest[offset + 1] & 255) << 16) |
        ((digest[offset + 2] & 255) << 8) |
        (digest[offset + 3] & 255);

    return String(binaryCode % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code, timestamp = Date.now()) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return false;
    }

    const suppliedCode = Buffer.from(code);
    for (const offset of [-30000, 0, 30000]) {
        const expectedCode = Buffer.from(generateTotpCode(secret, timestamp + offset));
        if (timingSafeEqual(suppliedCode, expectedCode)) {
            return true;
        }
    }

    return false;
}

async function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = await deriveKey(password, salt, passwordIterations, 32, 'sha256');
    return `${passwordScheme}$${passwordIterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, storedValue) {
    if (typeof storedValue !== 'string' || !storedValue) {
        return { valid: false, needsUpgrade: false };
    }

    const parts = storedValue.split('$');
    if (parts.length === 4 && parts[0] === passwordScheme) {
        const iterations = Number(parts[1]);
        if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) {
            return { valid: false, needsUpgrade: false };
        }

        const salt = Buffer.from(parts[2], 'base64');
        const expectedHash = Buffer.from(parts[3], 'base64');
        if (salt.length !== 16 || expectedHash.length !== 32) {
            return { valid: false, needsUpgrade: false };
        }
        const actualHash = await deriveKey(password, salt, iterations, expectedHash.length, 'sha256');
        return { valid: timingSafeEqual(actualHash, expectedHash), needsUpgrade: false };
    }

    const suppliedHash = createHash('sha256').update(password, 'utf8').digest();
    const storedHash = createHash('sha256').update(storedValue, 'utf8').digest();
    return { valid: timingSafeEqual(suppliedHash, storedHash), needsUpgrade: true };
}

function encryptSecret(secret, encryptionKey) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [nonce, tag, ciphertext].map(part => part.toString('base64')).join('.');
}

function decryptSecret(encryptedSecret, encryptionKey) {
    const parts = encryptedSecret.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted MFA secret.');
    }

    const [nonce, tag, ciphertext] = parts.map(part => Buffer.from(part, 'base64'));
    if (nonce.length !== 12 || tag.length !== 16) {
        throw new Error('Invalid encrypted MFA secret.');
    }

    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function createOtpAuthUrl(secret, accountName) {
    const label = encodeURIComponent(`HotelSys:${accountName}`);
    const issuer = encodeURIComponent('HotelSys');
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

function signAuditEvent(adminId, eventType, details, createdAt, auditKey) {
    const payload = `${adminId ?? ''}|${eventType}|${details}|${createdAt.toISOString()}`;
    return createHmac('sha256', auditKey).update(payload, 'utf8').digest('hex');
}

function verifyAuditEvent(event, auditKey) {
    const expected = Buffer.from(signAuditEvent(
        event.AdminId,
        event.EventType,
        event.Details,
        new Date(event.CreatedAt),
        auditKey
    ), 'hex');
    const supplied = Buffer.from(event.Signature, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

module.exports = {
    createOtpAuthUrl,
    decryptSecret,
    encryptSecret,
    generateTotpCode,
    generateTotpSecret,
    hashPassword,
    signAuditEvent,
    verifyAuditEvent,
    verifyPassword,
    verifyTotp
};
