'use client'

export const maxDuration = 30;

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FiTerminal,
  FiPlus,
  FiX,
  FiPaperclip,
  FiSend,
  FiRefreshCw,
  FiCheck,
  FiFile,
  FiImage,
  FiMessageSquare,
  FiCpu,
  FiCopy,
  FiMenu,
  FiTrash2,
} from 'react-icons/fi';
import { askGemini } from './actions';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  fileName?: string;
  fileData?: { base64: string; mimeType: string };
  timestamp: string;
  model?: string;
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'Google', description: 'Recommended - Fast & multimodal' },
  { id: 'openai/gpt-oss-20b:free', name: 'OpenAI GPT-OSS-20B', provider: 'OpenAI', description: 'Open weights - Free tier' }
];

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
}

function SignalDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
    </span>
  );
}

function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="prose-console text-[13.5px] leading-relaxed text-[#D7DBE3] overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="text-base font-semibold text-[#F2F4F7] mt-5 mb-2 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[15px] font-semibold text-[#F2F4F7] mt-5 mb-2 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-[#F2F4F7] mt-4 mb-1.5 first:mt-0">{children}</h3>,
          ul: ({ children }) => <ul className="mb-3 pl-5 space-y-1 list-disc marker:text-amber-400/70">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 pl-5 space-y-1 list-decimal marker:text-amber-400/70">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-[#F2F4F7]">{children}</strong>,
          em: ({ children }) => <em className="italic text-[#D7DBE3]">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-amber-500/40 pl-3 my-3 text-[#9AA2B1] italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-[#1D222C]" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-[#1D222C]">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#12151C]">{children}</thead>,
          th: ({ children }) => <th className="text-left font-mono text-[10px] uppercase tracking-wide text-[#7A8296] px-3 py-2 border-b border-[#1D222C]">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 border-b border-[#1D222C]/60 align-top">{children}</td>,
          code: ({ className, children, ...props }: any) => {
            const isBlock = /language-/.test(className || '');
            if (isBlock) {
              return (
                <code className={`block font-mono text-[12.5px] leading-relaxed text-[#E4E7EC] ${className || ''}`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="font-mono text-[12px] bg-[#12151C] border border-[#232A36] text-amber-300 px-1.5 py-0.5 rounded" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-[#0A0C10] border border-[#1D222C] rounded-xl p-3.5 my-3 overflow-x-auto">
              {children}
            </pre>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success'>('idle');
  const [attachedFile, setAttachedFile] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedSessions = localStorage.getItem('gemini_workspace_chats');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        setSessions(parsed);
        if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
        } else {
          createNewChat();
        }
      } catch (e) {
        createNewChat();
      }
    } else {
      createNewChat();
    }
  }, []);

  const saveToDisk = (updatedSessions: ChatSession[]) => {
    const sanitizedSessions = updatedSessions.map(session => ({
      ...session,
      messages: session.messages.map(msg => ({
        ...msg,
        fileData: undefined
      }))
    }));

    try {
      setSessions(updatedSessions);
      localStorage.setItem('gemini_workspace_chats', JSON.stringify(sanitizedSessions));
    } catch (e: any) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        const trimmedSessions = sanitizedSessions.slice(0, 5);
        try {
          localStorage.setItem('gemini_workspace_chats', JSON.stringify(trimmedSessions));
          setSessions(trimmedSessions);
        } catch (innerError) {
          console.error('Critical: Unable to save to localStorage.', innerError);
        }
      } else {
        console.error('LocalStorage write error:', e);
      }
    }
  };

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: `New Session #${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      messages: [],
      createdAt: new Date().toLocaleDateString()
    };

    const targetSessions = [newSession, ...sessions];
    saveToDisk(targetSessions);
    setActiveSessionId(newSession.id);
    setIsSidebarOpen(false);
  };

  const deleteChat = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter(s => s.id !== sessionId);
    
    if (filtered.length === 0) {
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        title: `New Session #${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        messages: [],
        createdAt: new Date().toLocaleDateString()
      };
      saveToDisk([newSession]);
      setActiveSessionId(newSession.id);
    } else {
      saveToDisk(filtered);
      if (activeSessionId === sessionId) {
        setActiveSessionId(filtered[0].id);
      }
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const currentMessages = activeSession ? activeSession.messages : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [currentMessages.length, loading, activeSessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!prompt.trim() && !attachedFile) || loading || !activeSessionId) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: prompt,
      fileName: attachedFile?.name,
      fileData: attachedFile ? { base64: attachedFile.base64, mimeType: attachedFile.mimeType } : undefined,
      timestamp
    };

    let updatedTitle = activeSession?.title || '';
    if (currentMessages.length === 0 && prompt.trim()) {
      updatedTitle = prompt.length > 24 ? `${prompt.substring(0, 24)}...` : prompt;
    }

    const updatedMessages = [...currentMessages, userMessage];

    let updatedSessions = sessions.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          title: updatedTitle,
          messages: updatedMessages
        };
      }
      return s;
    });

    saveToDisk(updatedSessions);
    setPrompt('');
    setLoading(true);

    const historyPayload = updatedMessages.map(msg => ({
      role: msg.role,
      text: msg.text || "",
      fileData: msg.fileData
    }));

    let response;
    try {
      response = await askGemini(historyPayload, selectedModel);
    } catch (err: any) {
      response = { error: `Network/Payload Limit Error: ${err?.message || 'Failed to fetch server action.'}` };
    }

    const modelMessage: Message = {
      id: crypto.randomUUID(),
      role: 'model',
      text: 'error' in response ? response.error : response.text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: selectedModel
    };

    updatedSessions = updatedSessions.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, messages: [...s.messages, modelMessage] };
      }
      return s;
    });

    saveToDisk(updatedSessions);
    setAttachedFile(null);
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setAttachedFile({
        base64: base64String,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSyncData = () => {
    setSyncStatus('syncing');
    setTimeout(() => {
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 2000);
    }, 1000);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#0A0C10] text-[#E4E7EC] flex font-sans relative">

      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* --- Sidebar Thread Console Room --- */}
      <section className={`fixed md:relative inset-y-0 left-0 z-40 w-72 md:w-80 bg-gradient-to-b from-[#090B0E] via-[#0D1016] to-[#0A0D12] border-r border-[#1D222C]/80 flex flex-col h-full shrink-0 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#141822_1px,transparent_1px),linear-gradient(to_bottom,#141822_1px,transparent_1px)] bg-[size:24px_24px] opacity-10 pointer-events-none" />

        {/* Brand Bar Header */}
        <div className="p-4 border-b border-[#1D222C]/60 flex items-center justify-between relative z-10 bg-[#090B0E]/40 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/30 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]">
              <FiTerminal size={16} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 bg-clip-text text-transparent font-mono">
                Gemini Console
              </h1>
              <p className="text-[9px] text-[#5B6472] font-mono tracking-wider flex items-center gap-1.5 mt-0.5">
                <SignalDot /> SYSTEM ONLINE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleSyncData}
              className="h-8 w-8 flex items-center justify-center rounded-xl text-[#5B6472] hover:text-amber-400 hover:bg-[#151A22] border border-transparent hover:border-[#232A36] transition-all cursor-pointer"
              title="Sync workspace"
            >
              {syncStatus === 'syncing' ? (
                <FiRefreshCw size={14} className="animate-spin text-amber-400" />
              ) : syncStatus === 'success' ? (
                <FiCheck size={14} className="text-emerald-400" />
              ) : (
                <FiRefreshCw size={14} />
              )}
            </button>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden h-8 w-8 flex items-center justify-center rounded-xl text-[#5B6472] hover:text-rose-400 hover:bg-[#151A22]"
            >
              <FiX size={16} />
            </button>
          </div>
        </div>

        {/* New Session Spawner */}
        <div className="p-4 relative z-10">
          <button
            onClick={createNewChat}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-[#0B0D12] font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 group cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_22px_rgba(245,158,11,0.35)] hover:-translate-y-0.5 active:translate-y-0 duration-200"
          >
            <FiPlus size={15} className="stroke-[3] group-hover:rotate-90 transition-transform duration-200" />
            START NEW SESSION
          </button>
        </div>

        {/* Live Conversation Stream Indexing Board */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5 scrollbar-none pt-2 relative z-10">
          <div className="px-2 pb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#4A5160] uppercase tracking-widest font-semibold">Active Channels</span>
            <span className="text-[9px] font-mono text-amber-400/50 bg-amber-400/5 px-1.5 py-0.5 rounded border border-amber-400/10">{sessions.length} CH</span>
          </div>

          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-[#1D222C] rounded-xl bg-[#090B0E]/30">
              <FiMessageSquare size={16} className="text-[#3A4150] mb-2" />
              <p className="text-[10.5px] text-[#4A5160] italic text-center">No active workspace sessions.</p>
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between group cursor-pointer border transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-[#1E1B13]/85 to-[#0D1016]/85 border-amber-500/40 text-amber-400 font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]'
                      : 'bg-[#0D1016]/30 hover:bg-[#101319]/70 border-[#1D222C]/40 text-[#7A8296] hover:text-[#D7DBE3] hover:border-[#232A36]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate flex-1 min-w-0 pr-2">
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${isActive ? 'bg-amber-400 animate-pulse' : 'bg-transparent'}`} />
                    <FiMessageSquare size={12} className={`shrink-0 opacity-70 ${isActive ? 'text-amber-400' : ''}`} />
                    <span className="truncate tracking-wide">{session.title}</span>
                  </div>
                  
                  {/* Always accessible trash/delete icon button */}
                  <button
                    type="button"
                    onClick={(e) => deleteChat(session.id, e)}
                    className="text-[#5B6472] hover:text-rose-400 p-1.5 rounded-lg hover:bg-[#1C202B] transition-all cursor-pointer shrink-0"
                    title="Delete chat session"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Cyber Footer Widget Section */}
        <div className="p-3.5 border-t border-[#1D222C]/60 bg-[#090B0E]/60 backdrop-blur-xs relative z-10">
          <div className="rounded-xl bg-[#0D1016]/80 border border-[#1D222C]/50 p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[9px] font-mono text-[#5B6472] uppercase tracking-wider">
              <span>System Core Status</span>
              <span className="text-[#3CD070] flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-[#3CD070] inline-block animate-pulse" />
                ONLINE
              </span>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[8.5px] text-[#4A5160] font-mono">
                <span>Active Model:</span>
                <span className="text-amber-400/70 truncate max-w-[120px] uppercase font-bold text-[8px]">
                  {AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name}
                </span>
              </div>
              
              <div className="h-1 w-full bg-[#161B24] rounded-full overflow-hidden flex">
                <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" style={{ width: '85%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Main Interactive Chat Display Screen Canvas --- */}
      <section className="flex-1 flex flex-col h-full bg-[#0A0C10] relative min-w-0">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

        {/* Top Header Bar */}
        <div className="px-4 md:px-6 py-3.5 border-b border-[#1D222C] bg-[#0D1016]/60 backdrop-blur-md flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden text-[#7A8296] hover:text-amber-400 p-1.5 -ml-1 rounded-lg hover:bg-[#151A22] transition-colors"
              title="Open Navigation"
            >
              <FiMenu size={18} />
            </button>
            <div className={`h-2 w-2 rounded-full shrink-0 ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
            <div className="min-w-0">
              <h2 className="text-xs font-semibold tracking-tight text-[#F2F4F7] truncate max-w-[150px] sm:max-w-xs md:max-w-md">
                {activeSession?.title || 'No Active Session'}
              </h2>
              <p className="text-[9px] text-[#5B6472] font-mono tracking-wider uppercase">
                {activeSession ? `${currentMessages.length} messages` : 'ready'}
              </p>
            </div>
          </div>

          {/* Model Selector Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="bg-[#0D1016] border border-[#232A36] hover:border-amber-500/40 text-[#E4E7EC] hover:text-amber-400 font-semibold py-1.5 px-3 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <FiCpu size={13} className="text-amber-400 shrink-0" />
              <span className="truncate max-w-[100px] sm:max-w-[140px]">{AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name}</span>
              <span className="text-[8px] text-[#5B6472]">▼</span>
            </button>

            {showModelDropdown && (
              <>
                <div
                  className="fixed inset-0 z-20 cursor-default"
                  onClick={() => setShowModelDropdown(false)}
                />

                <div className="absolute right-0 mt-2 w-64 sm:w-72 bg-[#0D1016] border border-[#232A36] rounded-xl shadow-xl z-30 p-1.5 space-y-1">
                  {AVAILABLE_MODELS.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelDropdown(false);
                      }}
                      className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 cursor-pointer ${selectedModel === model.id
                          ? 'bg-[#151A22] text-amber-400 border border-amber-500/20 font-medium'
                          : 'bg-transparent hover:bg-[#101319] text-[#7A8296] hover:text-[#D7DBE3] border border-transparent'
                        }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold">{model.name}</span>
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#1C2330] text-[#7A8296]">
                          {model.provider}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#5B6472] mt-0.5">{model.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Dynamic Canvas Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-7">
          {currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="h-12 w-12 bg-[#0D1016] border border-[#232A36] rounded-2xl flex items-center justify-center text-amber-400 mb-4 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                <FiTerminal size={20} />
              </div>
              <h3 className="text-sm font-medium text-[#D7DBE3] font-mono tracking-wide">
                session_ready <span className="text-amber-400 animate-pulse">_</span>
              </h3>
              <p className="text-xs text-[#5B6472] max-w-sm mt-2">
                This session is active. Attach a reference file or send a message to get started.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full space-y-7">
              {currentMessages.map((msg) => (
                msg.role === 'user' ? (
                  <div key={msg.id} className="flex flex-col max-w-[85%] md:max-w-[75%] space-y-1 ml-auto items-end">
                    <span className="text-[9px] text-[#4A5160] font-mono tracking-wide px-1">
                      CLIENT · {msg.timestamp}
                    </span>

                    {msg.fileName && (
                      <div className="text-[11px] bg-[#0D1016] border border-[#232A36] text-amber-400 py-1 px-2.5 rounded-lg flex items-center gap-1.5 font-mono mb-1 truncate max-w-full">
                        <FiFile size={11} className="shrink-0" /> <span className="truncate">{msg.fileName}</span>
                      </div>
                    )}

                    <div className="p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap border bg-amber-500 border-amber-400 text-[#1A1305] rounded-tr-none font-medium break-words w-full">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex gap-3 w-full group/msg">
                    <div className="h-7 w-7 rounded-lg bg-[#151A22] border border-[#232A36] flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                      <FiCpu size={13} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <span className="text-[9px] text-[#4A5160] font-mono tracking-wide px-0.5">
                        {msg.model?.includes('gpt-oss') 
                          ? 'GPT-OSS CORE' 
                          : 'GEMINI CORE'} · {msg.timestamp}
                      </span>
                      <MarkdownMessage text={msg.text} />
                      <button
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="opacity-0 group-hover/msg:opacity-100 flex items-center gap-1.5 text-[10px] font-mono text-[#5B6472] hover:text-amber-400 transition-all mt-1 cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <FiCheck size={11} className="text-emerald-400" />
                            <span className="text-emerald-400">copied</span>
                          </>
                        ) : (
                          <>
                            <FiCopy size={11} />
                            <span>copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              ))}

              {loading && (
                <div className="flex gap-3 w-full">
                  <div className="h-7 w-7 rounded-lg bg-[#151A22] border border-[#232A36] flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <FiCpu size={13} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <span className="text-[9px] text-[#4A5160] font-mono tracking-wide px-0.5">
                      {selectedModel.includes('gpt-oss') 
                        ? 'GPT-OSS CORE' 
                        : 'GEMINI CORE'} · streaming
                    </span>
                    <div className="flex gap-1.5 items-center h-7">
                      <span className="h-1.5 w-1.5 bg-amber-400/70 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 bg-amber-400/70 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 bg-amber-400/70 rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Console Action Input Deck */}
        <div className="p-3 md:p-4 border-t border-[#1D222C] bg-[#0A0C10] space-y-3 shrink-0">
          {attachedFile && (
            <div className="max-w-3xl mx-auto flex items-center justify-between bg-[#0D1016] border border-amber-500/20 p-2.5 rounded-xl text-xs">
              <div className="flex items-center gap-2 truncate text-[#D7DBE3]">
                {attachedFile.mimeType.includes('pdf') ? <FiFile size={13} /> : <FiImage size={13} />}
                <span className="font-mono truncate">{attachedFile.name}</span>
              </div>
              <button
                onClick={() => setAttachedFile(null)}
                className="text-[#5B6472] hover:text-rose-400 p-1 cursor-pointer"
              >
                <FiX size={13} />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-end gap-2 bg-[#0D1016] border border-[#1D222C] rounded-2xl p-2 focus-within:border-amber-500/40 transition-colors">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="application/pdf, image/*"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#151A22] border border-[#232A36] hover:border-[#333B4A] text-[#7A8296] h-10 w-10 flex items-center justify-center rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Attach reference file"
            >
              <FiPaperclip size={15} />
            </button>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Message Gemini... (Enter to send)"
              className="flex-1 bg-transparent border-0 outline-none text-[#E4E7EC] placeholder-[#4A5160] text-sm px-2 py-2 h-10 max-h-32 resize-none focus:ring-0"
            />

            <button
              type="submit"
              disabled={loading || (!prompt.trim() && !attachedFile)}
              className="bg-amber-500 hover:bg-amber-400 text-[#1A1305] h-10 w-10 flex items-center justify-center rounded-xl transition-colors disabled:opacity-30 shrink-0 cursor-pointer"
            >
              <FiSend size={15} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}