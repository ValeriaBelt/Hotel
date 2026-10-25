const { createHash, randomBytes } = require('node:crypto');

function createReservationManagementCode() {
    return randomBytes(32).toString('hex');
}

function hashReservationManagementCode(code) {
    if (typeof code !== 'string' || !/^[a-f0-9]{64}$/i.test(code)) {
        return null;
    }
    return createHash('sha256').update(code.toLowerCase(), 'utf8').digest('hex');
}

function isValidDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateReservationInput(input) {
    const {
        idHabitacion,
        fechaLlegada,
        fechaSalida,
        nombre,
        email,
        telefono
    } = input || {};
    const roomId = Number(idHabitacion);

    if (!Number.isSafeInteger(roomId) || roomId <= 0 || roomId > 2147483647 ||
        !isValidDate(fechaLlegada) || !isValidDate(fechaSalida) ||
        fechaLlegada >= fechaSalida ||
        typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100 ||
        typeof email !== 'string' || email.trim().length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof telefono !== 'string' || !/^\d{10}$/.test(telefono)) {
        return null;
    }

    return {
        idHabitacion: roomId,
        fechaLlegada,
        fechaSalida,
        nombre: nombre.trim(),
        email: email.trim(),
        telefono
    };
}

module.exports = {
    createReservationManagementCode,
    hashReservationManagementCode,
    isValidDate,
    validateReservationInput
};
