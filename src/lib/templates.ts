export const TEMPLATES = [
  { name: 'abertura_missao_semanal', category: 'UTILITY', usedIn: 'Abertura da missão', body: 'Olá, {{1}}! A missão da semana sobre {{2}} já está aberta. Responda pelo link {{3}} e bom jogo!' },
  { name: 'lembrete_missao', category: 'UTILITY', usedIn: 'Lembrete de quarta', body: 'Oi, {{1}}! Sua missão sobre {{2}} está esperando. São só 4 minutos, acesse {{3}} e participe.' },
  { name: 'ultimo_aviso_missao', category: 'UTILITY', usedIn: 'Último aviso', body: 'Última chance, {{1}}! A missão sobre {{2}} encerra hoje às 23h59. Acesse {{3}} e termine agora.' },
  { name: 'resultado_ranking', category: 'UTILITY', usedIn: 'Resultado e ranking', body: 'Olá, {{1}}! Saiu o resultado da missão. Veja sua posição em {{2}} e confira o ranking.' },
  { name: 'codigo_acesso', category: 'AUTHENTICATION', usedIn: 'Login por código', body: '{{1}} é o seu código de verificação do SafraQuest.' },
  { name: 'cadastro_aprovado', category: 'UTILITY', usedIn: 'Cadastro aprovado', body: 'Olá, {{1}}! Seu cadastro foi aprovado. Entre pelo link {{2}} e comece a jogar.' },
  { name: 'aviso_correcao', category: 'UTILITY', usedIn: 'Correção de pergunta', body: 'Olá, {{1}}! Um aviso sobre as perguntas do quiz: {{2}} Obrigado pela atenção.' },
  { name: 'vencedores_campanha', category: 'UTILITY', usedIn: 'Vencedores da campanha', body: 'Olá, {{1}}! Saíram os vencedores da campanha. Veja o resultado no SafraQuest.' },
];
