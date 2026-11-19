import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSafeRedirect } from '../utils/safeRedirect.js';

describe('getSafeRedirect', () => {
  const focusPath = '/foci/123e4567-e89b-42d3-a456-426614174000';

  it('retorna para a rota interna protegida original', () => {
    assert.equal(getSafeRedirect({ pathname: focusPath, search: '?tab=subjects', hash: '#active' }), `${focusPath}?tab=subjects#active`);
  });

  it('usa o painel para destinos externos ou rotas fora do app', () => {
    for (const pathname of ['https://example.com', '/register', '/unknown']) {
      assert.equal(getSafeRedirect({ pathname }), '/');
    }
  });

  it('rejeita destinos iniciados por barras duplas e barras invertidas', () => {
    for (const pathname of ['//example.com', '/\\example.com', '\\\\example.com']) {
      assert.equal(getSafeRedirect({ pathname }), '/');
    }
  });

  it('rejeita barras e barras invertidas codificadas, inclusive com codificação repetida', () => {
    for (const pathname of [
      '/%2f%2fexample.com',
      '/%5cexample.com',
      '/%252f%252fexample.com',
      '/%255cexample.com'
    ]) {
      assert.equal(getSafeRedirect({ pathname }), '/');
    }
  });

  it('usa o destino padrão seguro quando o estado não é válido', () => {
    assert.equal(getSafeRedirect(null), '/');
    assert.equal(getSafeRedirect({ pathname: '/foci/%zz' }), '/');
    assert.equal(getSafeRedirect({ pathname: focusPath, search: '//example.com' }), '/');
  });
});
