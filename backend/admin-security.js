const { randomBytes } = require('node:crypto');
const {
    createOtpAuthUrl,
    decryptSecret,
    encryptSecret,
    hashPassword,
    signAuditEvent,
    verifyAuditEvent,
    verifyPassword,
    verifyTotp,
    generateTotpSecret
} = require('./security-service');

const sessionCookie = 'hotelsys_session';
const sessionLifetimeSeconds = 8 * 60 * 60;
const challengeLifetimeMs = 5 * 60 * 1000;
const lockoutThreshold = 3;
const lockoutSeconds = 30;

function createAdminSecurity({ pool, sql, encryptionKey }) {
    const sessions = new Map();
    const challenges = new Map();
    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [token, session] of sessions) {
            if (session.expiresAt <= now) sessions.delete(token);
        }
        for (const [token, challenge] of challenges) {
            if (challenge.expiresAt <= now) challenges.delete(token);
        }
    }, 60000);
    cleanupTimer.unref();

    async function initialize() {
        await pool.request().query(`
            IF OBJECT_ID('dbo.AdminSecurity', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.AdminSecurity (
                    AdminId INT NOT NULL PRIMARY KEY,
                    TotpSecretEncrypted VARCHAR(500) NULL,
                    FailedAttempts INT NOT NULL CONSTRAINT DF_AdminSecurity_FailedAttempts DEFAULT 0,
                    LockedUntil DATETIME2 NULL
                );
            END;

            IF OBJECT_ID('dbo.AdminSecurityAudit', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.AdminSecurityAudit (
                    AuditId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    AdminId INT NULL,
                    EventType NVARCHAR(100) NOT NULL,
                    Details NVARCHAR(500) NOT NULL,
                    CreatedAt DATETIME2 NOT NULL,
                    Signature CHAR(64) NOT NULL
                );
            END;
        `);
    }

    async function recordAudit(adminId, eventType, details) {
        const createdAt = new Date();
        const signature = signAuditEvent(adminId, eventType, details, createdAt, encryptionKey);
        await pool.request()
            .input('adminId', sql.Int, adminId)
            .input('eventType', sql.NVarChar(100), eventType)
            .input('details', sql.NVarChar(500), details)
            .input('createdAt', sql.DateTime2, createdAt)
            .input('signature', sql.Char(64), signature)
            .query(`
                INSERT INTO dbo.AdminSecurityAudit (AdminId, EventType, Details, CreatedAt, Signature)
                VALUES (@adminId, @eventType, @details, @createdAt, @signature)
            `);
    }

    async function recordFailedAttempt(adminId, eventType, details) {
        let lockout = null;

        if (adminId !== null) {
            const result = await pool.request()
                .input('adminId', sql.Int, adminId)
                .input('threshold', sql.Int, lockoutThreshold)
                .input('lockoutSeconds', sql.Int, lockoutSeconds)
                .query(`
                    MERGE dbo.AdminSecurity WITH (HOLDLOCK) AS target
                    USING (SELECT @adminId AS AdminId) AS source
                    ON target.AdminId = source.AdminId
                    WHEN MATCHED THEN
                        UPDATE SET
                            FailedAttempts = target.FailedAttempts + 1,
                            LockedUntil = CASE
                                WHEN target.FailedAttempts + 1 >= @threshold
                                    THEN DATEADD(SECOND, @lockoutSeconds, SYSUTCDATETIME())
                                ELSE NULL
                            END
                    WHEN NOT MATCHED THEN
                        INSERT (AdminId, FailedAttempts, LockedUntil)
                        VALUES (
                            source.AdminId,
                            1,
                            CASE WHEN @threshold <= 1
                                THEN DATEADD(SECOND, @lockoutSeconds, SYSUTCDATETIME())
                                ELSE NULL
                            END
                        )
                    OUTPUT INSERTED.FailedAttempts, INSERTED.LockedUntil;
                `);
            lockout = result.recordset[0];
        }

        await recordAudit(adminId, eventType, details);
        return lockout;
    }

    async function getLockout(adminId) {
        const result = await pool.request()
            .input('adminId', sql.Int, adminId)
            .query('SELECT FailedAttempts, LockedUntil FROM dbo.AdminSecurity WHERE AdminId = @adminId');
        return result.recordset[0] || { FailedAttempts: 0, LockedUntil: null };
    }

    async function completeAuthentication(admin, challenge, req, res) {
        if (challenge.setupRequired) {
            await pool.request()
                .input('adminId', sql.Int, admin.idAdministrador)
                .input('secret', sql.VarChar(500), encryptSecret(challenge.secret, encryptionKey))
                .query(`
                    MERGE dbo.AdminSecurity WITH (HOLDLOCK) AS target
                    USING (SELECT @adminId AS AdminId) AS source
                    ON target.AdminId = source.AdminId
                    WHEN MATCHED THEN
                        UPDATE SET TotpSecretEncrypted = @secret, FailedAttempts = 0, LockedUntil = NULL
                    WHEN NOT MATCHED THEN
                        INSERT (AdminId, TotpSecretEncrypted, FailedAttempts, LockedUntil)
                        VALUES (source.AdminId, @secret, 0, NULL);
                `);
        } else {
            await pool.request()
                .input('adminId', sql.Int, admin.idAdministrador)
                .query('UPDATE dbo.AdminSecurity SET FailedAttempts = 0, LockedUntil = NULL WHERE AdminId = @adminId');
        }

        await recordAudit(admin.idAdministrador, 'admin.login.success', 'MFA verificado');
        challenges.delete(challenge.token);

        const token = randomBytes(32).toString('hex');
        const safeAdmin = {
            id: admin.idAdministrador,
            Nombre: admin.Nombre,
            Correo: admin.Correo
        };
        sessions.set(token, {
            admin: safeAdmin,
            expiresAt: Date.now() + sessionLifetimeSeconds * 1000
        });
        const cookieSecurity = req.secure
            ? 'Secure; SameSite=None'
            : 'SameSite=Lax';
        res.setHeader(
            'Set-Cookie',
            `${sessionCookie}=${token}; HttpOnly; ${cookieSecurity}; Path=/api; Max-Age=${sessionLifetimeSeconds}`
        );
        res.json({ message: 'Inicio de sesión exitoso.', admin: safeAdmin });
    }

    async function login(req, res) {
        const { correo, clave } = req.body || {};
        if (typeof correo !== 'string' || typeof clave !== 'string' ||
            correo.trim().length === 0 || correo.length > 100 || clave.length === 0 || clave.length > 256) {
            return res.status(400).json({ message: 'El correo y la contraseña son obligatorios.' });
        }

        try {
            const result = await pool.request()
                .input('correo', sql.VarChar(100), correo.trim())
                .query('SELECT idAdministrador, Nombre, Correo, Clave FROM Administrador WHERE Correo = @correo');
            const admin = result.recordset[0];

            if (!admin) {
                await recordFailedAttempt(null, 'admin.login.failure', 'Credenciales inválidas');
                return res.status(401).json({ message: 'Credenciales incorrectas.' });
            }

            const securityState = await getLockout(admin.idAdministrador);
            if (securityState.LockedUntil && new Date(securityState.LockedUntil) > new Date()) {
                return res.status(423).json({ message: 'Cuenta temporalmente bloqueada. Inténtalo más tarde.' });
            }

            const passwordCheck = await verifyPassword(clave, admin.Clave);
            if (!passwordCheck.valid) {
                const attempt = await recordFailedAttempt(
                    admin.idAdministrador,
                    'admin.login.failure',
                    'Credenciales inválidas'
                );
                if (attempt.LockedUntil) {
                    return res.status(423).json({ message: 'Cuenta temporalmente bloqueada. Inténtalo más tarde.' });
                }
                return res.status(401).json({ message: 'Credenciales incorrectas.' });
            }

            if (passwordCheck.needsUpgrade) {
                const passwordHash = await hashPassword(clave);
                await pool.request()
                    .input('adminId', sql.Int, admin.idAdministrador)
                    .input('passwordHash', sql.VarChar(255), passwordHash)
                    .query('UPDATE Administrador SET Clave = @passwordHash WHERE idAdministrador = @adminId');
            }

            const securityResult = await pool.request()
                .input('adminId', sql.Int, admin.idAdministrador)
                .query('SELECT TotpSecretEncrypted FROM dbo.AdminSecurity WHERE AdminId = @adminId');
            const encryptedSecret = securityResult.recordset[0]?.TotpSecretEncrypted;
            const setupRequired = !encryptedSecret;
            const secret = setupRequired ? generateTotpSecret() : decryptSecret(encryptedSecret, encryptionKey);
            const token = randomBytes(32).toString('hex');
            const challenge = {
                token,
                admin,
                secret,
                setupRequired,
                expiresAt: Date.now() + challengeLifetimeMs
            };
            challenges.set(token, challenge);

            await recordAudit(
                admin.idAdministrador,
                setupRequired ? 'admin.mfa.setup.started' : 'admin.mfa.challenge.started',
                'Contraseña verificada'
            );

            const response = {
                challengeToken: token,
                mfaSetupRequired: setupRequired
            };
            if (setupRequired) {
                response.mfaSecret = secret;
                response.otpAuthUrl = createOtpAuthUrl(secret, admin.Correo);
            }
            return res.json(response);
        } catch (error) {
            console.error('Error en la autenticación de administrador:', error);
            return res.status(500).json({ message: 'No se pudo completar el inicio de sesión.' });
        }
    }

    async function verifyMfa(req, res) {
        const { challengeToken, code } = req.body || {};
        if (typeof challengeToken !== 'string' || typeof code !== 'string') {
            return res.status(400).json({ message: 'Se requiere el código de autenticación.' });
        }

        const challenge = challenges.get(challengeToken);
        if (!challenge || challenge.expiresAt <= Date.now()) {
            challenges.delete(challengeToken);
            return res.status(401).json({ message: 'El proceso de autenticación expiró. Inicia sesión de nuevo.' });
        }

        try {
            const securityState = await getLockout(challenge.admin.idAdministrador);
            if (securityState.LockedUntil && new Date(securityState.LockedUntil) > new Date()) {
                return res.status(423).json({ message: 'Cuenta temporalmente bloqueada. Inténtalo más tarde.' });
            }

            if (!verifyTotp(challenge.secret, code)) {
                const attempt = await recordFailedAttempt(
                    challenge.admin.idAdministrador,
                    'admin.mfa.failure',
                    'Código MFA inválido'
                );
                if (attempt.LockedUntil) {
                    return res.status(423).json({ message: 'Cuenta temporalmente bloqueada. Inténtalo más tarde.' });
                }
                return res.status(401).json({ message: 'Código de autenticación incorrecto.' });
            }

            await completeAuthentication(challenge.admin, challenge, req, res);
        } catch (error) {
            console.error('Error al verificar MFA del administrador:', error);
            return res.status(500).json({ message: 'No se pudo verificar el código de autenticación.' });
        }
    }

    function getSessionToken(req) {
        const cookies = (req.headers.cookie || '').split(';');
        const sessionEntry = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith(`${sessionCookie}=`));
        return sessionEntry ? sessionEntry.slice(sessionCookie.length + 1) : null;
    }

    function requireSession(req, res, next) {
        const token = getSessionToken(req);
        const session = token && sessions.get(token);
        if (!session || session.expiresAt <= Date.now()) {
            if (token) {
                sessions.delete(token);
            }
            return res.status(401).json({ message: 'La sesión de administrador no es válida.' });
        }

        req.admin = session.admin;
        next();
    }

    function getCurrentSession(req, res) {
        res.json({ admin: req.admin });
    }

    async function logout(req, res) {
        const token = getSessionToken(req);
        const session = token && sessions.get(token);

        try {
            if (session) {
                await recordAudit(session.admin.id, 'admin.logout', 'Sesión cerrada');
                sessions.delete(token);
            }
            const cookieSecurity = req.secure
                ? 'Secure; SameSite=None'
                : 'SameSite=Lax';
            res.setHeader(
                'Set-Cookie',
                `${sessionCookie}=; HttpOnly; ${cookieSecurity}; Path=/api; Max-Age=0`
            );
            res.json({ message: 'Sesión cerrada.' });
        } catch (error) {
            console.error('Error al cerrar sesión de administrador:', error);
            res.status(500).json({ message: 'No se pudo cerrar la sesión.' });
        }
    }

    async function listAuditEvents(req, res) {
        try {
            const result = await pool.request().query(`
                SELECT TOP (100) AuditId, AdminId, EventType, Details, CreatedAt, Signature
                FROM dbo.AdminSecurityAudit
                ORDER BY AuditId DESC
            `);
            res.json(result.recordset.map(event => ({
                ...event,
                IntegrityValid: verifyAuditEvent(event, encryptionKey)
            })));
        } catch (error) {
            console.error('Error al consultar la bitácora de seguridad:', error);
            res.status(500).json({ message: 'No se pudo consultar la bitácora de seguridad.' });
        }
    }

    async function recordAdminCreated(adminId) {
        await recordAudit(adminId, 'admin.account.created', 'Cuenta de administrador creada');
    }

    async function recordAdminDeleted(adminId) {
        await pool.request()
            .input('adminId', sql.Int, adminId)
            .query('DELETE FROM dbo.AdminSecurity WHERE AdminId = @adminId');
        await recordAudit(adminId, 'admin.account.deleted', 'Cuenta de administrador eliminada');
    }

    return {
        initialize,
        listAuditEvents,
        login,
        logout,
        recordAdminCreated,
        recordAdminDeleted,
        requireSession,
        getCurrentSession,
        verifyMfa
    };
}

module.exports = { createAdminSecurity };
