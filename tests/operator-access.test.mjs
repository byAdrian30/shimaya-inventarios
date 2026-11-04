import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

globalThis.__shimayaTestEnv = {};
const mockEnv = 'data:text/javascript,export const env=globalThis.__shimayaTestEnv;';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: mockEnv, shortCircuit: true };
    return nextResolve(specifier, context);
  }
});

const { AUTH_USERS, TEAM_OPTIONS } = await import('../lib/auth-users.ts');
const { allowedTabs, canViewStock } = await import('../lib/team-access.ts');
const { visibleInventory } = await import('../lib/inventory-store.ts');

test('Adrian Barranzuela no tiene corona en la lista de usuarios y los chicos son operadores', () => {
  const adminOption = TEAM_OPTIONS.find(t => t.key === 'admin');
  assert.ok(adminOption, 'Existe opción de admin');
  assert.equal(adminOption.name, 'ADMIN ADRIAN BARRANZUELA');

  // En login-screen se genera: {member.role === 'viewer' ? '👁️ ' : '👤 '} {member.name}
  const renderedIcon = adminOption.role === 'viewer' ? '👁️ ' : '👤 ';
  assert.equal(renderedIcon, '👤 ');
  assert.equal(renderedIcon.includes('👑'), false, 'No debe tener corona');

  const chicos = ['ale', 'axl', 'celular', 'doris'];
  for (const c of chicos) {
    const user = AUTH_USERS[c];
    assert.ok(user, `Existe usuario ${c}`);
    assert.equal(user.role, 'operator', `${c} debe tener rol operator`);
  }
});

test('Los operadores no tienen acceso al stock ni en permisos ni en navegación', () => {
  // 1. canViewStock debe ser falso para operator
  assert.equal(canViewStock('operator'), false);
  assert.equal(canViewStock('admin'), true);
  assert.equal(canViewStock('viewer'), true);

  // 2. allowedTabs solo debe permitir pedido y despacho
  const tabs = allowedTabs('operator');
  assert.deepEqual(tabs, ['pedido', 'despacho']);
  assert.equal(tabs.includes('stock-consulta'), false, 'No debe incluir stock-consulta');
  assert.equal(tabs.includes('stock'), false, 'No debe incluir stock');
});

test('visibleInventory enmascara las existencias de stock en cero para perfiles operator', () => {
  const dummyState = {
    ingredients: [
      { id: 'cat-1', name: 'ARROZ JAPONES', category: 'Fideos y arroz', unit: 'kg', stock: 45, minimum: 5 },
      { id: 'cat-2', name: 'NORI', category: 'Abarrotes', unit: 'paquete', stock: 12, minimum: 2 },
    ],
    areaItems: [
      { id: 'item-1', name: 'ARROZ JAPONES', area: 'Ramen', ingredientId: 'cat-1', active: true },
      { id: 'item-2', name: 'NORI', area: 'Ramen', ingredientId: 'cat-2', active: true },
    ],
    requests: [
      {
        id: 'req-1',
        number: 'PED-001',
        area: 'Ramen',
        date: '2026-11-04',
        requester: 'Ale Campos',
        lines: [{ itemId: 'item-1', name: 'ARROZ JAPONES', quantity: 2, unit: 'kg', delivered: 0 }],
        dispatches: [],
        closed: false,
      }
    ],
    movements: [],
  };

  const operatorView = visibleInventory(dummyState, 'operator', 'dummy-id', 'Ramen');
  for (const ing of operatorView.ingredients) {
    assert.equal(ing.stock, 0, `El stock de ${ing.name} debe ser 0 para operadores`);
  }
});
