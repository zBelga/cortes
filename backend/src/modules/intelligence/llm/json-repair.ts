/**
 * Recuperação de JSON vindo de modelos locais.
 *
 * Modelos pequenos (7B–8B) obedecem ao `format: json` na maior parte das
 * vezes, mas não sempre: escapam com cercas de código, escrevem um preâmbulo
 * ou deixam uma vírgula sobrando. Jogar a resposta fora por causa disso
 * desperdiçaria minutos de inferência, então tentamos consertar antes.
 *
 * Não é um parser tolerante genérico — apenas conserta os quatro defeitos
 * que aparecem de fato na prática.
 */
export function repairJson(raw: string): string {
  let text = raw.trim();

  // 1. Cerca de código: ```json ... ```
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) text = fenced[1].trim();

  // 2. Preâmbulo ou epílogo em prosa: fica só do primeiro { ao último }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start > 0 || (end !== -1 && end < text.length - 1)) {
    if (start !== -1 && end > start) text = text.slice(start, end + 1);
  }

  // 3. Vírgula sobrando antes de fechar objeto ou array
  text = text.replace(/,(\s*[}\]])/g, '$1');

  // 4. Objeto truncado (o modelo estourou o limite de tokens):
  //    fecha o que ficou aberto, para que ao menos os itens completos sobrevivam.
  const balance = countUnclosed(text);
  if (balance.braces > 0 || balance.brackets > 0) {
    text = text.replace(/,\s*$/, '');
    text += ']'.repeat(balance.brackets) + '}'.repeat(balance.braces);
  }

  return text;
}

function countUnclosed(text: string): { braces: number; brackets: number } {
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') braces += 1;
    else if (char === '}') braces -= 1;
    else if (char === '[') brackets += 1;
    else if (char === ']') brackets -= 1;
  }

  return { braces: Math.max(0, braces), brackets: Math.max(0, brackets) };
}
