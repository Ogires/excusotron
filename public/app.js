const $ = (sel) => document.querySelector(sel);
const salida = $("#salida");
const aviso = $("#aviso");
let generando = false;

async function generar() {
  if (generando) return;
  generando = true;
  $("#generar").disabled = true;
  salida.textContent = "";
  aviso.textContent = "";
  $("#copiar").hidden = true;
  const nivel = document.querySelector("input[name=nivel]:checked").value;
  try {
    const respuesta = await fetch("/api/excusa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nivel: Number(nivel) }),
    });
    if (respuesta.status === 429) {
      const { segundos } = await respuesta.json();
      cuentaAtras(segundos);
      return;
    }
    if (!respuesta.ok || !respuesta.body) throw new Error("fallo");

    const lector = respuesta.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = "";
    let completa = "";
    let esReserva = false;
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const evento = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!evento.startsWith("data:")) continue;
        const dato = evento.slice(5).trim();
        if (dato === "[DONE]") continue;
        try {
          const { t } = JSON.parse(dato);
          if (t === "reserva") esReserva = true;
          else { completa += t; salida.textContent = completa; }
        } catch { /* evento parcial */ }
      }
    }
    aviso.textContent = esReserva ? "(excusa del cargador de reserva)" : "";
    $("#copiar").hidden = false;
  } catch {
    salida.textContent = "El Excusotron ha tosido. Inténtalo de nuevo.";
  } finally {
    generando = false;
    $("#generar").disabled = false;
    cargarContador();
  }
}

function cuentaAtras(segundos) {
  const fin = Date.now() + segundos * 1000;
  const temporizador = setInterval(() => {
    const restante = Math.ceil((fin - Date.now()) / 1000);
    if (restante <= 0) {
      clearInterval(temporizador);
      aviso.textContent = "Fin de la huelga. Ya puedes generar.";
      return;
    }
    aviso.textContent = `El Excusotron está en huelga ${restante}s…`;
  }, 500);
}

async function cargarContador() {
  try {
    const r = await fetch("/api/stats");
    const { total } = await r.json();
    $("#contador").textContent = total > 0 ? `${total.toLocaleString("es-ES")} excusas dispensadas` : "";
  } catch { /* silencio */ }
}

$("#generar").addEventListener("click", generar);
$("#copiar").addEventListener("click", async (e) => {
  await navigator.clipboard.writeText(salida.textContent);
  e.target.textContent = "¡Copiada!";
  setTimeout(() => (e.target.textContent = "Copiar"), 1500);
});
cargarContador();
