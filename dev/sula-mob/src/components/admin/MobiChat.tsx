'use client';

/**
 * MobiChat.tsx
 * ────────────
 * Burbuja flotante de MOBI, el asistente de IA de producción.
 * Se monta en el layout de /admin, así está disponible en todas
 * las pantallas del administrador y conserva la conversación al navegar.
 *
 * Habla con /api/mobi, que responde en streaming (líneas JSON).
 *
 * RUTA: src/components/admin/MobiChat.tsx
 */

import { useEffect, useRef, useState } from 'react';
import { Bot, RotateCcw, Send, X } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

const SUGERENCIAS = [
  '¿Cómo va la producción hoy?',
  '¿Qué pedidos están atrasados?',
  '¿Qué área tiene más trabajo pendiente?',
  '¿Qué avances se registraron hoy?',
];

export default function MobiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Saludo de bienvenida: aparece cada vez que el admin entra al sistema
  const [nombre, setNombre] = useState('');
  const [saludoVisible, setSaludoVisible] = useState(false);

  const bienvenida = nombre ? `Bienvenido, ${nombre}` : 'Bienvenido';

  useEffect(() => {
    let cancelado = false;
    fetch('/api/mobi')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(json => {
        if (cancelado) return;
        setNombre(typeof json?.nombre === 'string' ? json.nombre : '');
        setSaludoVisible(true);
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /** Reemplaza el último mensaje (la respuesta de MOBI que se está escribiendo). */
  const updateLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages(prev => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

  const send = async (text: string) => {
    const pregunta = text.trim();
    if (!pregunta || loading) return;

    // Al servidor solo va el historial válido: sin errores ni respuestas vacías
    const historial = [
      ...messages.filter(m => !m.error && m.content.trim()),
      { role: 'user' as const, content: pregunta },
    ];

    setMessages(prev => [...prev, { role: 'user', content: pregunta }, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    setStatus('Pensando');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/mobi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historial.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'MOBI no está disponible en este momento.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'text') {
            setStatus('');
            updateLast(m => ({ ...m, content: m.content + event.delta }));
          } else if (event.type === 'tool') {
            setStatus(event.label);
          } else if (event.type === 'error') {
            updateLast(m => ({ ...m, content: event.message, error: true }));
          }
        }
      }

      // El servidor cerró sin texto ni error (no debería pasar)
      updateLast(m => (m.content ? m : { ...m, content: 'MOBI no devolvió respuesta. Intenta de nuevo.', error: true }));
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'No se pudo contactar a MOBI.';
      updateLast(m => ({ ...m, content: msg, error: true }));
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        setStatus('');
        abortRef.current = null;
      }
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setLoading(false);
    setStatus('');
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Saludo de bienvenida junto al botón */}
      <div
        className={`
          fixed bottom-5 right-[84px] z-[60]
          max-w-[min(300px,calc(100vw-7rem))]
          flex items-start gap-2 pl-4 pr-2 py-3 rounded-2xl rounded-br-md
          backdrop-blur-[50px] backdrop-saturate-[2.2]
          bg-[#0b111c]/90 border border-blue-500/30
          shadow-[0_0_20px_rgba(59,130,246,0.25),0_8px_20px_rgba(0,0,0,0.4)]
          transition-all duration-500 origin-bottom-right
          ${saludoVisible && !open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}
        `}
      >
        <button
          onClick={() => { setSaludoVisible(false); setOpen(true); }}
          className="text-left"
        >
          <p className="text-[13px] font-semibold text-white leading-snug">{bienvenida}</p>
          <p className="text-[13px] text-slate-300 leading-snug mt-0.5">¿En qué te podemos ayudar hoy?</p>
        </button>
        <button
          onClick={() => setSaludoVisible(false)}
          aria-label="Cerrar saludo"
          className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Botón flotante */}
      <button
        onClick={() => { setSaludoVisible(false); setOpen(o => !o); }}
        aria-label={open ? 'Cerrar MOBI' : 'Abrir MOBI, asistente de producción'}
        className="
          fixed bottom-5 right-5 z-[60]
          flex items-center justify-center w-14 h-14 rounded-full
          bg-blue-600 text-white
          shadow-[0_0_24px_rgba(59,130,246,0.5),0_8px_20px_rgba(0,0,0,0.4)]
          hover:bg-blue-500 hover:scale-105
          transition-all duration-300
        "
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Panel del chat */}
      <div
        className={`
          fixed bottom-24 right-5 z-[60]
          w-[400px] max-w-[calc(100vw-2.5rem)]
          h-[580px] max-h-[calc(100dvh-7.5rem)]
          flex flex-col overflow-hidden rounded-2xl
          backdrop-blur-[50px] backdrop-saturate-[2.2]
          bg-[#0b111c]/90 border border-white/[0.1]
          shadow-2xl shadow-black/60
          transition-all duration-300 origin-bottom-right
          ${open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}
        `}
      >
        {/* Encabezado */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08] bg-white/[0.04]">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.5)]">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">MOBI</p>
            <p className="text-[11px] text-slate-400">Asistente de producción · datos en vivo</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={reset}
              title="Nueva conversación"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            title="Cerrar"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-end gap-4">
              <div>
                <p className="text-sm font-semibold text-white">{bienvenida}</p>
                <p className="text-sm text-slate-200 mt-0.5">¿En qué te podemos ayudar hoy?</p>
                <p className="text-[13px] text-slate-400 mt-2 leading-relaxed">
                  Soy MOBI. Pregúntame sobre pedidos, avances por área, retrasos o lo que registran los operadores.
                  Consulto la producción en el momento.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {SUGERENCIAS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-[13px] px-3 py-2 rounded-xl border border-white/[0.1] bg-white/[0.04] text-slate-200 hover:bg-blue-600/20 hover:border-blue-500/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              const esUltimo = i === messages.length - 1;
              // La respuesta vacía en curso se muestra como indicador de estado
              if (m.role === 'assistant' && !m.content && !(esUltimo && loading)) return null;
              return (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`
                      max-w-[88%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words
                      ${m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : m.error
                          ? 'bg-red-500/10 border border-red-500/30 text-red-200 rounded-bl-md'
                          : 'bg-white/[0.07] border border-white/[0.08] text-slate-100 rounded-bl-md'
                      }
                    `}
                  >
                    {m.content}
                    {m.role === 'assistant' && esUltimo && loading && (!m.content || status) && (
                      <span className={`flex items-center gap-2 text-slate-400 ${m.content ? 'mt-2' : ''}`}>
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
                        </span>
                        {status || 'Pensando'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Entrada */}
        <form
          onSubmit={e => { e.preventDefault(); send(input); }}
          className="flex items-end gap-2 px-3 py-3 border-t border-white/[0.08] bg-white/[0.03]"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Pregúntale a MOBI…"
            className="flex-1 resize-none max-h-28 min-h-[42px] rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white placeholder:text-slate-500 outline-none focus:border-blue-500/60 transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Enviar"
            className="flex items-center justify-center w-[42px] h-[42px] rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );
}
