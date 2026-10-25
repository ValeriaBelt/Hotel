const assert = require('node:assert/strict');
const test = require('node:test');
const { createAdminSecurity } = require('./admin-security');
const { generateTotpCode, signAuditEvent } = require('./security-service');

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
                    if (/SELECT\s+FailedAttempts,/.test(query)) {
                        return { recordset: [] };
                    }
                    if (query.includes('SELECT TotpSecretEncrypted')) {
                        return { recordset: [{
                            TotpSecretEncrypted: state.encryptedSecret,
                            Role: 'Administrador'
                        }] };
                    }
                    if (query.includes('INSERT INTO dbo.AdminSecurityAudit')) {
                        auditEvents.push({ ...inputs });
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
    assert.equal(verifyResponse.body.admin.Rol, 'Administrador');
    assert.match(verifyResponse.headers['Set-Cookie'], /SameSite=Lax/);
    assert.doesNotMatch(verifyResponse.headers['Set-Cookie'], /Secure/);
    assert.equal(auditEvents.length, 2);
    assert.equal(auditEvents[0].targetProfile, null);
    assert.equal(auditEvents[1].targetProfile, null);

    const sessionRequest = {
        headers: { cookie: verifyResponse.headers['Set-Cookie'].split(';')[0] }
    };
    const sessionResponse = createResponse();
    security.requireSession(sessionRequest, sessionResponse, () => {
        sessionResponse.json({ admin: sessionRequest.admin });
    });
    assert.equal(sessionResponse.body.admin.id, admin.idAdministrador);
});

test('locks an administrator on the third failed password attempt', async () => {
    const admin = {
        idAdministrador: 23,
        Nombre: 'Lockout Test',
        Correo: 'lockout@example.test',
        Clave: 'correct-password'
    };
    const state = { failedAttempts: 0, lockedUntil: null };
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
                    if (/SELECT\s+FailedAttempts,/.test(query)) {
                        return {
                            recordset: state.failedAttempts === 0
                                ? []
                                : [{
                                    FailedAttempts: state.failedAttempts,
                                    IsLocked: state.lockedUntil !== null && state.lockedUntil > Date.now()
                                }]
                        };
                    }
                    if (query.includes('MERGE dbo.AdminSecurity')) {
                        const isExpired = state.lockedUntil !== null && state.lockedUntil <= Date.now();
                        state.failedAttempts = isExpired ? 1 : state.failedAttempts + 1;
                        state.lockedUntil = !isExpired && state.failedAttempts >= inputs.threshold
                            ? Date.now() + inputs.lockoutSeconds * 1000
                            : null;
                        return {
                            recordset: [{
                                FailedAttempts: state.failedAttempts,
                                IsLocked: state.lockedUntil !== null && state.lockedUntil > Date.now()
                            }]
                        };
                    }
                    if (query.includes('INSERT INTO dbo.AdminSecurityAudit')) {
                        auditEvents.push({ ...inputs });
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
        encryptionKey: Buffer.alloc(32, 4)
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
        const response = createResponse();
        await security.login({
            body: { correo: admin.Correo, clave: 'wrong-password' }
        }, response);

        assert.equal(response.statusCode, attempt === 3 ? 423 : 401);
        if (attempt === 3) {
            assert.match(response.body.message, /bloqueada/i);
        }
    }

    const blockedResponse = createResponse();
    await security.login({
        body: { correo: admin.Correo, clave: 'correct-password' }
    }, blockedResponse);

    assert.equal(blockedResponse.statusCode, 423);
    assert.equal(state.failedAttempts, 3);
    assert.equal(auditEvents.length, 3);
    assert.ok(auditEvents.every(event => event.targetProfile === 'Lockout Test (lockout@example.test)'));
});

test('enforces role middleware and denies operators administrator-only actions', () => {
    const sql = {};
    const security = createAdminSecurity({
        pool: {},
        sql,
        encryptionKey: Buffer.alloc(32, 6)
    });

    let adminPassed = false;
    security.requireRoles('Administrador')(
        { admin: { Rol: 'Administrador' } },
        createResponse(),
        () => { adminPassed = true; }
    );
    assert.equal(adminPassed, true);

    let operatorRoomManagementPassed = false;
    security.requireRoles('Administrador', 'Operador')(
        { admin: { Rol: 'Operador' } },
        createResponse(),
        () => { operatorRoomManagementPassed = true; }
    );
    assert.equal(operatorRoomManagementPassed, true);

    const deniedResponse = createResponse();
    security.requireRoles('Administrador')(
        { admin: { Rol: 'Operador' } },
        deniedResponse,
        () => assert.fail('Operador must not access administrator-only actions.')
    );
    assert.equal(deniedResponse.statusCode, 403);
});

test('shows the target profile for historical failed logins without changing audit integrity', async () => {
    const createdAt = new Date('2026-10-25T03:44:00.390Z');
    const auditKey = Buffer.alloc(32, 7);
    const auditEvent = {
        AuditId: 42,
        AdminId: 12,
        EventType: 'admin.login.failure',
        Details: 'Credenciales inválidas',
        TargetProfile: null,
        CreatedAt: createdAt,
        Signature: signAuditEvent(
            12,
            'admin.login.failure',
            'Credenciales inválidas',
            createdAt,
            auditKey
        ),
        TargetAdminName: 'Test Admin',
        TargetAdminEmail: 'admin@example.test'
    };
    const pool = {
        request() {
            return {
                async query(query) {
                    assert.match(query, /LEFT JOIN dbo\.Administrador/);
                    return { recordset: [auditEvent] };
                }
            };
        }
    };
    const security = createAdminSecurity({ pool, sql: {}, encryptionKey: auditKey });
    const response = createResponse();

    await security.listAuditEvents({}, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body[0].TargetProfile, 'Test Admin (admin@example.test)');
    assert.equal(response.body[0].IntegrityValid, true);
    assert.equal('TargetAdminName' in response.body[0], false);
});

test('filters audit events by attacks, logins, or all recorded events', async () => {
    const queries = [];
    const security = createAdminSecurity({
        pool: {
            request() {
                return {
                    async query(query) {
                        queries.push(query);
                        return { recordset: [] };
                    }
                };
            }
        },
        sql: {},
        encryptionKey: Buffer.alloc(32, 8)
    });

    for (const category of ['attacks', 'logins', 'all']) {
        const response = createResponse();
        await security.listAuditEvents({ query: { category } }, response);
        assert.equal(response.statusCode, 200);
    }

    assert.match(queries[0], /'admin\.login\.failure', 'admin\.mfa\.failure'/);
    assert.match(queries[1], /'admin\.login\.success'/);
    assert.match(queries[1], /'admin\.logout'/);
    assert.doesNotMatch(queries[2], /WHERE 1 = 1 AND audit\.EventType/);

    const invalidResponse = createResponse();
    await security.listAuditEvents({ query: { category: 'unknown' } }, invalidResponse);
    assert.equal(invalidResponse.statusCode, 400);
    assert.equal(queries.length, 3);
});

test('explains why an unidentified historical target cannot be recovered', async () => {
    const createdAt = new Date('2026-10-25T03:44:00.390Z');
    const auditKey = Buffer.alloc(32, 10);
    const details = 'Credenciales inválidas';
    const auditEvent = {
        AuditId: 43,
        AdminId: null,
        EventType: 'admin.login.failure',
        Details: details,
        TargetProfile: null,
        CreatedAt: createdAt,
        Signature: signAuditEvent(null, 'admin.login.failure', details, createdAt, auditKey),
        TargetAdminName: null,
        TargetAdminEmail: null
    };
    const security = createAdminSecurity({
        pool: {
            request() {
                return {
                    async query() {
                        return { recordset: [auditEvent] };
                    }
                };
            }
        },
        sql: {},
        encryptionKey: auditKey
    });
    const response = createResponse();

    await security.listAuditEvents({}, response);

    assert.equal(
        response.body[0].TargetProfile,
        'Cuenta no identificada (el registro histórico no guardó la cuenta objetivo)'
    );
    assert.equal(response.body[0].IntegrityValid, true);
});
