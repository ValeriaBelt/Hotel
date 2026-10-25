const assert = require('node:assert/strict');
const test = require('node:test');
const { createAdminSecurity } = require('./admin-security');
const { generateTotpCode } = require('./security-service');

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test('completes password and MFA login and issues an HTTP local-development session', async () => {
    const admin = {
        idAdministrador: 12,
        Nombre: 'Test Admin',
        Correo: 'admin@example.test',
        Clave: 'test-password'
    };
    const state = { encryptedSecret: null };
    const auditEvents = [];
    const sql = {
        Int: 'Int',
        DateTime2: 'DateTime2',
        NVarChar: () => 'NVarChar',
        VarChar: () => 'VarChar',
        Char: () => 'Char'
    };
    const pool = {
        request() {
            const inputs = {};
            return {
                input(name, _type, value) {
                    inputs[name] = value;
                    return this;
                },
                async query(query) {
                    if (query.includes('FROM Administrador WHERE Correo')) {
                        return { recordset: [admin] };
                    }
                    if (query.includes('SELECT FailedAttempts, LockedUntil')) {
                        return { recordset: [] };
                    }
                    if (query.includes('SELECT TotpSecretEncrypted')) {
                        return { recordset: [{ TotpSecretEncrypted: state.encryptedSecret }] };
                    }
                    if (query.includes('INSERT INTO dbo.AdminSecurityAudit')) {
                        auditEvents.push(inputs);
                        return { recordset: [], rowsAffected: [1] };
                    }
                    if (query.includes('UPDATE Administrador SET Clave')) {
                        admin.Clave = inputs.passwordHash;
                        return { recordset: [], rowsAffected: [1] };
                    }
                    if (query.includes('WHEN NOT MATCHED THEN')) {
                        state.encryptedSecret = inputs.secret;
                        return { recordset: [], rowsAffected: [1] };
                    }
                    if (query.includes('UPDATE dbo.AdminSecurity SET FailedAttempts')) {
                        return { recordset: [], rowsAffected: [1] };
                    }
                    throw new Error(`Unexpected SQL in test: ${query}`);
                }
            };
        }
    };
    const security = createAdminSecurity({
        pool,
        sql,
        encryptionKey: Buffer.alloc(32, 9)
    });

    const loginResponse = createResponse();
    await security.login({
        body: { correo: admin.Correo, clave: 'test-password' }
    }, loginResponse);

    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.body.mfaSetupRequired, true);
    assert.ok(loginResponse.body.challengeToken);

    const verifyResponse = createResponse();
    await security.verifyMfa({
        body: {
            challengeToken: loginResponse.body.challengeToken,
            code: generateTotpCode(loginResponse.body.mfaSecret)
        },
        secure: false,
        headers: {}
    }, verifyResponse);

    assert.equal(verifyResponse.statusCode, 200);
    assert.equal(verifyResponse.body.admin.id, admin.idAdministrador);
    assert.match(verifyResponse.headers['Set-Cookie'], /SameSite=Lax/);
    assert.doesNotMatch(verifyResponse.headers['Set-Cookie'], /Secure/);
    assert.equal(auditEvents.length, 2);

    const sessionRequest = {
        headers: { cookie: verifyResponse.headers['Set-Cookie'].split(';')[0] }
    };
    const sessionResponse = createResponse();
    security.requireSession(sessionRequest, sessionResponse, () => {
        sessionResponse.json({ admin: sessionRequest.admin });
    });
    assert.equal(sessionResponse.body.admin.id, admin.idAdministrador);
});
