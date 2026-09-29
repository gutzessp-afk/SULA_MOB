// Sistema de notificaciones por email vía Resend (GRATIS: 100 emails/día)
// Archivo: src/lib/notificar.ts

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

export interface OpcionesNotificacion {
  asunto: string;
  mensaje: string;
  html?: string;
  destino?: string;
}

// ── Función principal: manda email ──
export async function notificar(
  opciones: OpcionesNotificacion
): Promise<{ ok: boolean; error?: string }> {
  const { asunto, mensaje, html, destino } = opciones;
  const apiKey = process.env.RESEND_API_KEY;
  const to = destino || process.env.NOTIFICAR_A;

  if (!apiKey) {
    console.error('[notificar] RESEND_API_KEY no configurada');
    return { ok: false, error: 'API key de Resend no configurada' };
  }
  if (!to) {
    console.error('[notificar] NOTIFICAR_A no configurado');
    return { ok: false, error: 'Correo destino no configurado' };
  }

  try {
    const { error } = await resend.emails.send({
      from: 'SULA MOB <onboarding@resend.dev>',
      to: [to],
      subject: asunto,
      text: mensaje,
      ...(html && { html }),
    });

    if (error) {
      console.error('[notificar] Error Resend:', error.message);
      return { ok: false, error: error.message };
    }
    console.log(`[notificar] Email enviado: "${asunto}" -> ${to}`);
    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[notificar] Error:', errorMsg);
    return { ok: false, error: errorMsg };
  }
}

// ── Datos para el email ──
interface DatosIncidencia {
  tipo: string;
  area: string;
  mensaje: string;
  reportadoPor: string;
  prioridad?: string;
  maquina?: string;
  turno?: string;
}

// ── Template HTML mejorado ──
function generarHtmlIncidencia(datos: DatosIncidencia & { fecha: string }) {
  const { tipo, area, mensaje, reportadoPor, fecha, prioridad, maquina, turno } = datos;

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const tipoConfig: Record<string, { bg: string; emoji: string; label: string }> = {
    alerta:     { bg: '#dc2626', emoji: '🔴', label: 'ALERTA URGENTE' },
    incidencia: { bg: '#ea580c', emoji: '⚠️', label: 'INCIDENCIA' },
    mensaje:    { bg: '#0ea5e9', emoji: '💬', label: 'MENSAJE' },
    aviso:      { bg: '#6366f1', emoji: '📢', label: 'AVISO' },
  };

  const prioridadConfig: Record<string, { color: string; label: string }> = {
    baja:    { color: '#10b981', label: '🟢 Baja' },
    media:   { color: '#0ea5e9', label: '🔵 Media' },
    alta:    { color: '#f59e0b', label: '🟡 Alta' },
    critica: { color: '#ef4444', label: '🔴 Crítica' },
  };

  const t = tipoConfig[tipo] || tipoConfig.mensaje;
  const p = prioridadConfig[prioridad || 'media'] || prioridadConfig.media;

  return `
<div style="font-family:'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;background:#0b0f17;border-radius:20px;overflow:hidden;border:1px solid #1e293b;">
  
  <!-- Header con tipo -->
  <div style="background:linear-gradient(135deg,${t.bg},${t.bg}cc);padding:24px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;letter-spacing:0.5px;">${t.emoji} ${t.label}</h1></td>
      <td align="right"><span style="background:rgba(255,255,255,0.2);color:#fff;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;">SULA MOB</span></td>
    </tr></table>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:12px;">Sistema de Planta — Reporte de Operador</p>
  </div>

  <div style="padding:28px;">

    <!-- Badges: Prioridad + Turno -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr>
      <td><span style="display:inline-block;background:${p.color}22;color:${p.color};padding:6px 14px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid ${p.color}44;">Prioridad: ${p.label}</span></td>
      ${turno ? `<td align="right"><span style="display:inline-block;background:#1e293b;color:#94a3b8;padding:6px 14px;border-radius:12px;font-size:12px;font-weight:600;border:1px solid #334155;">🕐 Turno ${turno.charAt(0).toUpperCase() + turno.slice(1)}</span></td>` : ''}
    </tr></table>

    <!-- Info grid -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:16px;border:1px solid #1e293b;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #1e293b;width:50%;">
          <p style="color:#64748b;font-size:10px;margin:0 0 4px;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Area</p>
          <p style="color:#f1f5f9;font-size:14px;margin:0;font-weight:600;">${area}</p>
        </td>
        <td style="padding:16px 20px;border-bottom:1px solid #1e293b;width:50%;">
          <p style="color:#64748b;font-size:10px;margin:0 0 4px;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Reportado por</p>
          <p style="color:#f1f5f9;font-size:14px;margin:0;font-weight:600;">${reportadoPor}</p>
        </td>
      </tr>
      ${maquina ? `
      <tr>
        <td colspan="2" style="padding:16px 20px;border-bottom:1px solid #1e293b;">
          <p style="color:#64748b;font-size:10px;margin:0 0 4px;text-transform:uppercase;font-weight:700;letter-spacing:1px;">🔧 Maquina / Equipo</p>
          <p style="color:#fbbf24;font-size:14px;margin:0;font-weight:700;">${maquina}</p>
        </td>
      </tr>` : ''}
      <tr>
        <td colspan="2" style="padding:16px 20px;">
          <p style="color:#64748b;font-size:10px;margin:0 0 4px;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Fecha y Hora</p>
          <p style="color:#94a3b8;font-size:13px;margin:0;">${fecha}</p>
        </td>
      </tr>
    </table>

    <!-- Mensaje -->
    <div style="margin-top:20px;background:#1a1d27;border-radius:16px;padding:20px;border-left:4px solid ${t.bg};">
      <p style="color:#64748b;font-size:10px;margin:0 0 8px;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Detalle del Reporte</p>
      <p style="color:#e2e8f0;font-size:15px;margin:0;line-height:1.7;">${mensaje}</p>
    </div>

    <!-- Boton -->
    <div style="margin-top:24px;text-align:center;">
      <a href="${appUrl}/admin/notificaciones" style="display:inline-block;background:linear-gradient(135deg,${t.bg},${t.bg}cc);color:#fff;padding:14px 32px;border-radius:14px;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:0.3px;">
        Ver en el Sistema →
      </a>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:16px 28px;border-top:1px solid #1e293b;text-align:center;background:#0a0d14;">
    <p style="color:#475569;font-size:11px;margin:0;">Notificacion automatica — SULA MOB 🏭</p>
    <p style="color:#334155;font-size:10px;margin:4px 0 0;">Este correo fue enviado desde el panel de operadores</p>
  </div>
</div>`;
}

// ── Función principal de incidencia (ahora recibe objeto) ──
export async function notificarIncidencia(datos: DatosIncidencia) {
  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const emojis: Record<string, string> = { alerta: '🔴', incidencia: '⚠️', mensaje: '💬', aviso: '📢' };
  const prioridadLabel: Record<string, string> = { baja: 'BAJA', media: 'MEDIA', alta: 'ALTA', critica: 'CRITICA' };

  const asuntoParts = [
    emojis[datos.tipo] || '📢',
    datos.tipo.toUpperCase(),
    `[${prioridadLabel[datos.prioridad || 'media'] || 'MEDIA'}]`,
    `— ${datos.area}`,
    datos.maquina ? `(${datos.maquina})` : '',
    `— ${datos.mensaje.substring(0, 40)}...`,
  ].filter(Boolean).join(' ');

  const textoPlano = [
    `${datos.tipo.toUpperCase()} en ${datos.area}`,
    `Prioridad: ${datos.prioridad || 'media'}`,
    datos.turno ? `Turno: ${datos.turno}` : '',
    datos.maquina ? `Maquina: ${datos.maquina}` : '',
    '',
    datos.mensaje,
    '',
    `Reportado por: ${datos.reportadoPor}`,
    `Fecha: ${fecha}`,
  ].filter((l) => l !== undefined).join('\n');

  return notificar({
    asunto: asuntoParts,
    mensaje: textoPlano,
    html: generarHtmlIncidencia({ ...datos, fecha }),
  });
}

// ── Helper: Error crítico ──
export async function notificarError(donde: string, error: string) {
  return notificar({
    asunto: `⚠️ Error en SULA MOB: ${donde}`,
    mensaje: `Error en ${donde}: ${error}`,
  });
}
