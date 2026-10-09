'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { Minus, Send } from 'lucide-react';
import { playMobiBienvenida, playMobiDing, playMobiPop } from '@/lib/mobiSound';
import MobiRobot from './MobiRobot';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Saludo y avisos de error: se muestran en el chat pero no se mandan como historial */
  local?: boolean;
}

const SALUDO_RESPALDO = '¡Hola! 👋 Soy Mobi, tu asistente de SULA MOB. ¿En qué te puedo ayudar?';

export default function MobiChat() {
  // robot: cuerpo completo con el letrero de bienvenida al cargar · head: cabeza flotante · chat: ventana abierta
  const [chatState, setChatState] = useState<'robot' | 'head' | 'chat'>('robot');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const saludoPedido = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sonido y voz de entrada, una sola vez y con un pequeño retraso para que primero se vea el robot.
  // Si el navegador bloquea el audio al cargar, suenan con la primera interacción.
  // El nombre se pide al servidor (la cookie de sesión es httpOnly); si tarda, saluda sin nombre.
  useEffect(() => {
    const nombre: Promise<string> = fetch('/api/mobi')
      .then((res) => res.json())
      .then((data) => (typeof data?.nombre === 'string' ? data.nombre : ''))
      .catch(() => '');
    const conLimite = Promise.race([
      nombre,
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 2000)),
    ]);
    let cancelar = () => {};
    const timer = setTimeout(() => {
      cancelar = playMobiBienvenida(conLimite);
    }, 500);
    return () => {
      clearTimeout(timer);
      cancelar();
    };
  }, []);

  // El robot completo saluda unos segundos y se reduce a la cabeza
  useEffect(() => {
    if (chatState !== 'robot') return;
    const timer = setTimeout(() => setChatState('head'), 4000);
    return () => clearTimeout(timer);
  }, [chatState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, chatState]);

  useEffect(() => {
    if (chatState === 'chat' && !isLoading) inputRef.current?.focus();
  }, [chatState, isLoading]);

  // La primera vez que se abre, pide el saludo con el nombre y el resumen del día.
  // El nombre lo pone el servidor: la cookie de sesión es httpOnly y aquí no se puede leer.
  async function openChat() {
    setChatState('chat');
    playMobiPop();
    if (saludoPedido.current) return;
    saludoPedido.current = true;

    setIsLoading(true);
    let saludo = SALUDO_RESPALDO;
    try {
      const res = await fetch('/api/mobi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'greeting' }),
      });
      const data = await res.json();
      if (data.ok && data.reply) saludo = data.reply;
    } catch {
      // Sin conexión: se queda el saludo genérico
    }
    setMessages((prev) => [{ role: 'assistant', content: saludo, local: true }, ...prev]);
    setIsLoading(false);
    playMobiDing();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const updatedMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    const responder = (content: string, local = false) =>
      setMessages((prev) => [...prev, { role: 'assistant', content, local }]);

    try {
      const res = await fetch('/api/mobi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages
            .filter((m) => !m.local)
            .map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = await res.json();

      if (data.ok) {
        responder(data.reply);
        playMobiDing();
      } else {
        responder(data.error || 'Ups, algo salió mal. Intenta de nuevo. 😅', true);
      }
    } catch {
      responder('No pude conectarme. Revisa tu conexión a internet. 🔌', true);
    } finally {
      setIsLoading(false);
    }
  }

  if (chatState === 'robot') {
    return (
      <button
        onClick={() => setChatState('head')}
        className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-700"
        aria-label="Minimizar a Mobi"
      >
        <MobiRobot variant="full" />
      </button>
    );
  }

  if (chatState === 'head') {
    return (
      <button
        onClick={openChat}
        className="fixed bottom-6 right-6 z-50 transition-transform animate-in fade-in zoom-in-50 duration-500 hover:scale-110 active:scale-95"
        aria-label="Abrir chat con Mobi"
      >
        <MobiRobot variant="head" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[520px] max-h-[calc(100dvh-2rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0e1a]/95 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 sm:bottom-6 sm:right-6">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-gradient-to-r from-blue-600/90 to-blue-800/90 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/25">
            <MobiRobot variant="mini" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-blue-800 bg-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Mobi</p>
            <p className="text-[10px] text-white/60">Asistente SULA MOB • En línea</p>
          </div>
        </div>
        <button
          onClick={() => setChatState('head')}
          className="rounded-lg p-1.5 text-white/60 transition-all hover:bg-white/10 hover:text-white"
          aria-label="Minimizar chat"
        >
          <Minus className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mobi-scroll flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role === 'assistant' && (
              <div className="mr-2 mt-1 shrink-0">
                <MobiRobot variant="mini" />
              </div>
            )}
            <div
              className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/20'
                  : 'border border-white/[0.08] bg-white/[0.04] text-white/90'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start justify-start animate-in fade-in duration-200">
            <div className="mr-2 mt-1 shrink-0">
              <MobiRobot variant="mini" />
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/[0.06] bg-[#080c16] p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu pregunta..."
            maxLength={500}
            disabled={isLoading}
            className="min-w-0 flex-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none transition-all focus:border-blue-500/40 focus:shadow-[0_0_12px_rgba(59,130,246,0.3)] disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/20 transition-all hover:shadow-blue-500/40 disabled:opacity-30 disabled:shadow-none"
            aria-label="Enviar mensaje"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
