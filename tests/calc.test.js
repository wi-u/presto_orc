// Rode com:  node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const C = require('../assets/calc.js');

const rd = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const pol = rd('politica.json');
const tab = rd('precos.json');
const item = cod => tab.itens.find(i => i.cod === cod);
const base = { tipo: 'revenda', volume: 'normal', pgto: 'none', gerencial: false, linhaOn: true };
const preco = (cod, uf, o) => C.precoUnitario(item(cod), { ...base, ...o }, pol, C.perfilDaUF(pol, uf));
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('todas as 27 UFs têm perfil', () => {
  for (const uf of Object.keys(pol.nomes_uf)) assert.ok(C.perfilDaUF(pol, uf), uf);
});

test('revenda nacional: 50% no Sul/SP/MG/RJ, 54% nos demais', () => {
  perto(preco('93002', 'SP'), 310.76 * 0.50);
  perto(preco('93002', 'RS'), 310.76 * 0.50);
  perto(preco('93002', 'ES'), 310.76 * 0.46);
  perto(preco('93002', 'BA'), 310.76 * 0.46);
  perto(preco('93002', 'AM'), 310.76 * 0.46);
});

test('uso e consumo: 40% (nacional)', () => {
  perto(preco('93002', 'SP', { tipo: 'consumo' }), 310.76 * 0.60);
  perto(preco('93002', 'PE', { tipo: 'consumo' }), 310.76 * 0.60);
});

test('importado revenda: adicional 14% (SP/MG/RJ/SC/PR), 10% (ES/CO/NE/N), 0% (RS)', () => {
  const b = 550.97; // 96047, origem 1
  perto(preco('96047', 'SP'), b * 0.50 * 0.86);
  perto(preco('96047', 'SC'), b * 0.50 * 0.86);
  perto(preco('96047', 'RS'), b * 0.50);
  perto(preco('96047', 'ES'), b * 0.46 * 0.90);
  perto(preco('96047', 'GO'), b * 0.46 * 0.90);
});

test('importado uso e consumo: base 25%, sem adicional', () => {
  perto(preco('96047', 'SP', { tipo: 'consumo' }), 550.97 * 0.75);
  perto(preco('96047', 'RS', { tipo: 'consumo' }), 550.97 * 0.75);
});

test('linha caixa de ferramentas: −10% e pode ser desligada', () => {
  perto(preco('91800', 'SP'), 168.11 * 0.50 * 0.90);
  perto(preco('91800', 'SP', { linhaOn: false }), 168.11 * 0.50);
});

test('extras em cascata: atacado, à vista, gerencial', () => {
  perto(preco('93002', 'SP', { volume: 'atacado', pgto: 'avista', gerencial: true }), 310.76 * 0.5 * 0.9 * 0.95 * 0.95);
  perto(preco('93002', 'SP', { pgto: 'boleto' }), 310.76 * 0.5 * 0.97);
});

test('tabela (bruto) devolve o bruto para item nacional', () => {
  perto(preco('93002', 'SP', { tipo: 'tabela' }), 310.76);
});

test('catálogo: sem códigos repetidos e linhas existem na política', () => {
  const cods = tab.itens.map(i => i.cod);
  assert.strictEqual(new Set(cods).size, cods.length);
  for (const i of tab.itens) if (i.linha) assert.ok(pol.linhas[i.linha], i.cod);
});
