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

const { AUTH_USERS } = await import('../lib/auth-users.ts');
const { allowedTabs, canViewStock } = await import('../lib/team-access.ts');
const { canPerform } = await import('../lib/requests.ts');
const { visibleInventory } = await import('../lib/inventory-store.ts');
const { emptyState } = await import('../lib/inventory.ts');

test('Los 4 socios existen en AUTH_USERS con rol viewer y nombre exacto', () => {
  const socios = [
    { key: 'socio_daniel', name: 'SOCIO DANIEL', slug: 'daniel' },
    { key: 'socio_jhony', name: 'SOCIO JHONY', slug: 'jhony' },
    { key: 'socio_javier', name: 'SOCIO JAVIER', slug: 'javier' },
    { key: 'socio_riki', name: 'SOCIO RIKI', slug: 'riki' },
  ];

  for (const s of socios) {
    const user = AUTH_USERS[s.key];
    assert.ok(user, `Falta usuario ${s.key}`);
    assert.equal(user.fullName, s.name);
    assert.equal(user.role, 'viewer');
    assert.ok(user.userId.startsWith('socio-'));

    // Alias slug directo
    const alias = AUTH_USERS[s.slug];
    assert.ok(alias, `Falta alias para slug ${s.slug}`);
    assert.equal(alias.fullName, s.name);
    assert.equal(alias.role, 'viewer');
  }
});

test('El rol viewer tiene habilitadas las 14 pestañas de visualización completa', () => {
  const tabs = allowedTabs('viewer');
  const expectedTabs = [
    'inicio',
    'rendimiento',
    'proyeccion',
    'stock',
    'valores',
    'ingreso',
    'pedido',
    'despacho',
    'stock-consulta',
    'ordenes',
    'consulta',
    'catalogo',
    'historial',
    'equipo',
  ];

  assert.equal(tabs.length, 14);
  assert.deepEqual(tabs, expectedTabs);
  assert.equal(canViewStock('viewer'), true);
});

test('El rol viewer tiene bloqueada cualquier mutación o cambio en inventario', () => {
  const mutationTypes = [
    'solicitar',
    'despachar',
    'entrada',
    'merma',
    'conteo',
    'importar',
    'revertir',
    'eliminar-orden',
    'vincular-area',
    'vincular-areas',
    'approve',
    'invite',
    'suspend',
  ];

  for (const t of mutationTypes) {
    assert.equal(canPerform('viewer', t), false, `Acción ${t} no debe permitirse al viewer`);
  }
});

test('visibleInventory entrega la totalidad de insumos, movimientos y pedidos al viewer', () => {
  const state = emptyState();
  state.ingredients.push({
    id: 'test-1',
    name: 'SOJU ORIGINAL',
    category: 'Bebidas',
    unit: 'und',
    stock: 12,
    minimum: 5,
    configured: true,
  });
  state.movements.push({
    id: 'mov-1',
    date: '2026-11-04',
    at: new Date().toISOString(),
    kind: 'entrada',
    lines: [{ ingredientId: 'test-1', name: 'SOJU ORIGINAL', unit: 'und', delta: 12, before: 0, after: 12 }],
  });

  const viewerState = visibleInventory(state, 'viewer', 'socio-daniel-shimaya');
  assert.equal(viewerState.ingredients.length, state.ingredients.length);
  assert.equal(viewerState.ingredients[0].stock, 12);
  assert.equal(viewerState.movements.length, 1);
});
