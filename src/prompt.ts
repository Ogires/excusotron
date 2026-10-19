// src/prompt.ts
export type Nivel = 1 | 2 | 3;

export const ANIMALES = [
  "un lémur suspicaz", "una cabra con initiative propia", "un pingüino con sombrero",
  "un tejón notario", "una nidada de patos hackers", "un búho sindicalista",
  "un mapache astrónomo", "una iguana influencer", "un topo cartógrafo",
  "una garza mediadora", "un erizo nómada digital", "una tortuga consultora",
];

export const OBJETOS = [
  "una impresora poseída", "el mando de la airfryer", "un bidón de lubricante industrial",
  "la llave inglesa de mi abuelo", "una fotocopiadora de 1987", "el router del vecino",
  "una escoba smart con firmware obsoleto", "un ornitorrinco de peluche",
  "la última tuerca del IKEA", "un altavoz que solo suena a los Sabían de Ultramar",
  "un hornillo de camping", "el microondas del coworking",
];

export const EVENTOS = [
  "un eclipse parcial", "la asamblea del casero", "un flashmob de tai chi",
  "la protesta de los pavos reales", "un apagón diplomático", "la llegada del camión del gas",
  "un torneo clandestino de petanca", "la mudanza de un contrabajo",
  "un simulacro de meteorito", "la feria del pimiento relleno", "la huelga de los semáforos",
  "el sorteo del roscón de enero",
];

const DESCRIPCION_NIVEL: Record<Nivel, string> = {
  1: "absurdo y épico: cuanto más ridícula, mejor",
  2: "ciencia-ficción plausible, como capítulo de Black Mirror mal doblado",
  3: "creíble, aburrida y digna: algo que podría decirse sin que nadie parpadee",
};

export function validarNivel(valor: unknown): Nivel | null {
  const n = Number(valor);
  return n === 1 || n === 2 || n === 3 ? (n as Nivel) : null;
}

function elegir<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

export function buildPrompt(nivel: Nivel): { system: string; user: string } {
  return {
    system:
      "Eres el Excusotron 3000, una máquina experimental española de los años 80 que genera excusas " +
      "para no ir a trabajar. Respondes SIEMPRE en castellano, con una sola excusa de máximo 80 palabras, " +
      "sin introducciones, sin comillas y sin cerraduras tipo 'espero que entiendas'. Solo la excusa.",
    user:
      `Genera una excusa nivel ${nivel} (${DESCRIPCION_NIVEL[nivel]}) para no ir a trabajar hoy. ` +
      `Debe involucrar obligatoriamente: ${elegir(ANIMALES)}, ${elegir(OBJETOS)} y ${elegir(EVENTOS)}.`,
  };
}
