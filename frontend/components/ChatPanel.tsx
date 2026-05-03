'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { api } from '../lib/api';
import type { ChatMessage } from '../lib/types';

const SUGGESTIONS = [
  'What are the most serious risks here?',
  'Are there any restrictive covenants?',
  'What additional fees does the buyer pay on top of the hammer price?',
  'Is the EPC band good enough to let this property?',
];

export function ChatPanel({ jobId, enabled }: { jobId: string; enabled: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api
      .getMessages(jobId)
      .then((r) => {
        if (!cancelled) setMessages(r.messages);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [jobId, enabled]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending]);

  function send(text: string) {
    if (!text.trim() || pending) return;
    setError(null);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    startTransition(async () => {
      try {
        const r = await api.sendMessage(jobId, text);
        const assistant: ChatMessage = {
          id: `tmp-a-${Date.now()}`,
          role: 'assistant',
          content: r.reply,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistant]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Send failed');
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      }
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <section className="flex h-[28rem] flex-col rounded-lg border border-zinc-200 dark:border-zinc-800">
      <header className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Ask about this pack</h2>
        <p className="text-xs text-zinc-500">
          {enabled ? 'Answers cite the source documents.' : 'Available once analysis completes.'}
        </p>
      </header>

      <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!enabled && (
          <p className="text-sm text-zinc-500">Waiting for analysis to finish…</p>
        )}

        {enabled && messages.length === 0 && !pending && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-500">Try a starter question:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-100 px-3.5 py-2 text-sm text-zinc-500 dark:bg-zinc-900">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="border-t border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="border-t border-zinc-200 p-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!enabled || pending}
            placeholder={enabled ? 'Ask anything about this pack…' : 'Waiting for analysis…'}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={!enabled || pending || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
