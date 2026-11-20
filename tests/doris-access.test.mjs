import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';

globalThis.__shimayaTestEnv = {
  DB: {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM inventory_state WHERE id=?')) {
                return {
                  data: JSON.stringify({
                    ownerId: 'wNhManJrwsi8DIq0POByz4Rf2f8TNv8J143HJdh7RdMRewC1cNtQmS',
                    teamAccessVersion: 'pedido-despacho-v1'
                  })
                };
              }
              if (sql.includes('FROM team_members WHERE email=?')) {
                return {
                  email: 'drojaschilcon@gmail.com',
                  userId: 'zIEqlW3sklm75keZGvuUbOtBiHnbxVdIhzExS089MQ8EiEKtxs3E1J',
                  name: 'Doris Yanela Rojas Chilcon',
                  area: '',
                  role: 'admin',
                  status: 'active'
                };
              }
              return null;
            },
            async run() { return { success: true }; },
            async all() { return { results: [] }; }
          };
        }
      };
    }
  }
};

const mockEnv = 'data:text/javascript,export const env=globalThis.__shimayaTestEnv;';
const mockNextServer = `data:text/javascript,
export class NextResponse extends Response {
  constructor(body, init) {
    super(body, init);
    this.cookies = { set() {} };
  }
  static json(data, init) {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) }
    });
  }
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: mockEnv, shortCircuit: true };
    if (specifier === 'next/server') return { url: mockNextServer, shortCircuit: true };
    if (specifier === '@/lib/auth-users') {
      return { url: pathToFileURL(pathResolve('lib/auth-users.ts')).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

const { AUTH_USERS, TEAM_OPTIONS, DORIS_PASSWORD } = await import('../lib/auth-users.ts');
const { allowedTabs, canViewStock } = await import('../lib/team-access.ts');
const { workspaceFor } = await import('../lib/workspace.ts');
const { POST: loginRoute } = await import('../app/api/auth/login/route.ts');

test('Doris Rojas tiene credenciales y contraseña configuradas correctamente', () => {
  assert.equal(DORIS_PASSWORD, '75178486', 'Contraseña de Doris debe ser 75178486');

  const dorisUser = AUTH_USERS.doris;
  assert.ok(dorisUser, 'Debe existir el usuario doris en AUTH_USERS');
  assert.equal(dorisUser.role, 'admin', 'El rol de doris debe ser admin para acceso total');
  assert.equal(dorisUser.email, 'drojaschilcon@gmail.com');
  assert.equal(dorisUser.fullName, 'Doris Yanela Rojas Chilcon');

  // Comprobar que en su nombre NO aparece la palabra admin ni administrador
  assert.equal(dorisUser.fullName.toLowerCase().includes('admin'), false);
  assert.equal(dorisUser.fullName.toLowerCase().includes('administrador'), false);

  const dorisOption = TEAM_OPTIONS.find(t => t.key === 'doris');
  assert.ok(dorisOption, 'Debe existir la opción doris en TEAM_OPTIONS');
  assert.equal(dorisOption.isAdmin, true, 'isAdmin debe ser true');
  assert.equal(dorisOption.name.toLowerCase().includes('admin'), false);
});

test('Doris Rojas tiene acceso total a todas las pestañas y al stock', () => {
  const dorisRole = AUTH_USERS.doris.role;

  // Acceso al stock
  assert.equal(canViewStock(dorisRole), true, 'Doris debe poder ver stock');

  // Acceso a todas las 14 pestañas del sistema
  const tabs = allowedTabs(dorisRole);
  assert.equal(tabs.length, 14, 'Doris debe tener habilitadas las 14 pestañas');
  const expectedTabs = [
    'inicio', 'rendimiento', 'proyeccion', 'stock', 'valores',
    'ingreso', 'pedido', 'despacho', 'stock-consulta', 'ordenes',
    'consulta', 'catalogo', 'historial', 'equipo'
  ];
  for (const t of expectedTabs) {
    assert.ok(tabs.includes(t), `Pestaña ${t} debe estar permitida para Doris`);
  }
});

test('workspaceFor asigna rol admin a Doris Rojas en el backend oficial', async () => {
  const scope = await workspaceFor({
    userId: 'zIEqlW3sklm75keZGvuUbOtBiHnbxVdIhzExS089MQ8EiEKtxs3E1J',
    email: 'drojaschilcon@gmail.com',
    fullName: 'Doris Yanela Rojas Chilcon',
    displayName: 'Doris Yanela Rojas Chilcon'
  });

  assert.equal(scope.role, 'admin', 'El scope en el backend debe ser admin');
  assert.equal(scope.status, 'active');
  assert.equal(scope.ownerId, 'wNhManJrwsi8DIq0POByz4Rf2f8TNv8J143HJdh7RdMRewC1cNtQmS');
});

test('API /api/auth/login valida correctamente la contraseña de Doris Rojas (75178486)', async () => {
  // 1. Sin contraseña -> 401
  const reqNoPass = new Request('https://shimaya-inventarios.vercel.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey: 'doris', password: '' })
  });
  const resNoPass = await loginRoute(reqNoPass);
  assert.equal(resNoPass.status, 401);
  const dataNoPass = await resNoPass.json();
  assert.equal(dataNoPass.error.includes('Contraseña incorrecta'), true);

  // 2. Contraseña incorrecta -> 401
  const reqBadPass = new Request('https://shimaya-inventarios.vercel.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey: 'doris', password: 'password123' })
  });
  const resBadPass = await loginRoute(reqBadPass);
  assert.equal(resBadPass.status, 401);

  // 3. Contraseña correcta (75178486) -> 200 y rol admin
  const reqOk = new Request('https://shimaya-inventarios.vercel.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey: 'doris', password: '75178486' })
  });
  const resOk = await loginRoute(reqOk);
  assert.equal(resOk.status, 200);
  const dataOk = await resOk.json();
  assert.equal(dataOk.success, true);
  assert.equal(dataOk.user.key, 'doris');
  assert.equal(dataOk.user.role, 'admin');
  assert.equal(dataOk.user.name, 'Doris Yanela Rojas Chilcon');
});
