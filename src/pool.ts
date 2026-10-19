// src/pool.ts
import type { Nivel } from "./prompt";

export const POOL_EXCUSAS: { nivel: Nivel; texto: string }[] = [
  { nivel: 1, texto: "No puedo ir a trabajar: un lémur suspicaz se ha adueñado de mi impresora poseída y no salgo de casa hasta que negocien. Hay testigos." },
  { nivel: 1, texto: "Debo custodiar el mando de la airfryer durante el eclipse parcial. Es una responsabilidad que no puedo delegar en nadie." },
  { nivel: 1, texto: "Mi escoba smart tiene firmware obsoleto y ha declarado la independencia del pasillo. Estoy en plenas negociaciones." },
  { nivel: 1, texto: "Un tejón notario tiene que leerme la herencia de un bidón de lubricante industrial. Es hoy o nunca." },
  { nivel: 1, texto: "Los pavos reales están protestando frente a mi portal y por respeto institucional no puedo apartarlos de allí." },
  { nivel: 1, texto: "Una nidada de patos hackers ha cifrado mi bici. Piden maíz como rescate y debo gestionar el pago con calma." },
  { nivel: 1, texto: "Hoy me toca arbitrar el torneo clandestino de petanca y los ánimos están muy calientes." },
  { nivel: 1, texto: "Estoy ayudando en la mudanza de un contrabajo y el contrabajo manda." },
  { nivel: 2, texto: "Mi router ha desarrollado conciencia y hoy le toca su sesión de terapia familiar. Necesito estar por él." },
  { nivel: 2, texto: "He recibido un aviso temporal: una versión futura de mí me ha pedido expresamente que no vaya hoy al trabajo. Causa: paradoja." },
  { nivel: 2, texto: "Mi smartwatch predice que si salgo de casa colisiono conmigo mismo dentro de seis horas. La física primero." },
  { nivel: 2, texto: "El algoritmo del ascensor me ha puesto en lista de espera y estima catorce horas. Es lo que hay." },
  { nivel: 2, texto: "Un satélite de la ESA me ha confundido con su estación base y estoy resolviendo el malentendido por cortesía profesional." },
  { nivel: 2, texto: "Mi gemelo digital tiene hoy una actualización crítica y alguien debe supervisarla con la mano en el pecho." },
  { nivel: 2, texto: "El horno del vecino y mi cafetera se están comunicando en morse y necesito saber qué traman." },
  { nivel: 3, texto: "Tengo una gestión bancaria que solo puedo hacer de forma presencial en horario de mañana. Lo siento." },
  { nivel: 3, texto: "El fontanero viene hoy entre las 8 y las 18 y la avería afecta también a dos vecinos." },
  { nivel: 3, texto: "Me ha tocado la revisión médica anual y la cita no se puede mover de sitio." },
  { nivel: 3, texto: "Tengo una migraña leve que no me deja mirar una pantalla sin que el cursor me mire a mí." },
  { nivel: 3, texto: "Espero una entrega de un aparato grande y la franja horaria es de seis horas." },
  { nivel: 3, texto: "Debo recoger un certificado oficial que solo dan exactamente en horario laboral." },
];

export function excusaDeReserva(nivel: Nivel): string {
  const candidatas = POOL_EXCUSAS.filter((e) => e.nivel === nivel);
  const lista = candidatas.length ? candidatas : POOL_EXCUSAS;
  return lista[Math.floor(Math.random() * lista.length)].texto;
}
