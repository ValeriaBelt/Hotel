const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createReservationManagementCode,
    hashReservationManagementCode,
    validateReservationInput
} = require('./reservation-security');

test('creates unguessable reservation management codes and stores only deterministic hashes', () => {
    const first = createReservationManagementCode();
    const second = createReservationManagementCode();

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(first, second);
    assert.equal(hashReservationManagementCode(first), hashReservationManagementCode(first));
    assert.match(hashReservationManagementCode(first), /^[a-f0-9]{64}$/);
    assert.equal(hashReservationManagementCode(first.toUpperCase()), hashReservationManagementCode(first));
    assert.equal(hashReservationManagementCode('invalid'), null);
});

test('validates public booking data before starting a reservation transaction', () => {
    const validInput = {
        idHabitacion: '12',
        fechaLlegada: '2026-11-01',
        fechaSalida: '2026-11-03',
        nombre: '  Cliente de prueba  ',
        email: ' cliente@example.test ',
        telefono: '3001234567'
    };

    assert.deepEqual(validateReservationInput(validInput), {
        idHabitacion: 12,
        fechaLlegada: '2026-11-01',
        fechaSalida: '2026-11-03',
        nombre: 'Cliente de prueba',
        email: 'cliente@example.test',
        telefono: '3001234567'
    });
    assert.equal(validateReservationInput({ ...validInput, fechaLlegada: '2026-02-30' }), null);
    assert.equal(validateReservationInput({ ...validInput, fechaSalida: '2026-11-01' }), null);
    assert.equal(validateReservationInput({ ...validInput, idHabitacion: '1; DELETE' }), null);
    assert.equal(validateReservationInput({ ...validInput, telefono: '123' }), null);
});
