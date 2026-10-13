/* Motor de cálculo de preços — puro (sem acesso a tela), usado pelo app e pelos testes.
 * Regras vêm de data/politica.json. Ordem (multiplicativa):
 *   bruto → base da política (revenda/consumo; consumo importado tem base própria)
 *         → adicional de importados (só se o item for importado)
 *         → desconto de linha (ex.: caixa de ferramentas)
 *         → volume (atacado) → pagamento → gerencial
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrestoCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function perfilDaUF(politica, uf) {
    const id = politica.ufs[String(uf || '').toUpperCase()];
    return id ? politica.perfis[id] : null;
  }

  /** Preço da tabela antes dos descontos de extras (base da política + importados). */
  function precoBase(prod, tipo, perfil) {
    const bruto = prod.preco_bruto;
    if (tipo === 'tabela') return bruto;
    if (tipo === 'revenda') return bruto * (1 - perfil.revenda);
    return bruto * (1 - (prod.importado ? perfil.consumo_importados : perfil.consumo));
  }

  function precoUnitario(prod, opts, politica, perfil) {
    const o = opts;
    let p = precoBase(prod, o.tipo, perfil);

    if (prod.importado) {
      // Na "Tabela (bruto)" mantém o comportamento do app original: usa o adicional de revenda.
      const ad = o.tipo === 'consumo' ? perfil.adicional_importados_consumo : perfil.adicional_importados_revenda;
      p *= 1 - ad;
    }
    if (prod.linha && o.linhaOn !== false) {
      const l = politica.linhas[prod.linha];
      if (l) p *= 1 - l.desconto;
    }
    if (o.volume === 'atacado') p *= 1 - politica.extras.volume.desconto;
    if (o.pgto === 'avista') p *= 1 - politica.pagamento.avista.desconto;
    else if (o.pgto === 'boleto') p *= 1 - politica.pagamento.boleto.desconto;
    if (o.gerencial) p *= 1 - politica.extras.gerencial.desconto;
    return p;
  }

  return { perfilDaUF, precoBase, precoUnitario };
});
