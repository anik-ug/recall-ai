import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Globe2, Plus, Search, Sparkles, Clock3, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
type Source = { title: string; url: string; publishedDate?: string };
type Message = { id: string; role: "user" | "assistant"; content: string; sources?: Source[]; created_at?: string; createdAt?: string };
type Conversation = { id: string; title: string; updated_at: string; last_message?: string };

function formatTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function renderText(text: string) {
  // Small safe Markdown subset: links and paragraphs. All text is rendered as text nodes.
  const chunks = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return chunks.map((chunk, index) => {
    const match = chunk.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    return match ? <a key={index} href={match[2]} target="_blank" rel="noreferrer">{match[1]}</a> : <span key={index}>{chunk}</span>;
  });
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    const response = await fetch(`${API}/api/conversations`);
    if (!response.ok) throw new Error("Could not load conversations");
    const data = await response.json();
    setConversations(data.conversations);
    return data.conversations as Conversation[];
  }
  async function openConversation(id: string) {
    setActiveId(id); setError("");
    const response = await fetch(`${API}/api/conversations/${id}/messages`);
    if (!response.ok) throw new Error("Could not load this conversation");
    const data = await response.json();
    setMessages(data.messages);
  }
  async function newConversation() {
    setError("");
    const response = await fetch(`${API}/api/conversations`, { method: "POST" });
    if (!response.ok) throw new Error("Could not create a conversation");
    const data = await response.json();
    setActiveId(data.conversation.id); setMessages([]);
    await loadConversations();
  }

  useEffect(() => {
    loadConversations().then(async (items) => {
      if (items.length) await openConversation(items[0].id);
      else await newConversation();
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || loading || !activeId) return;
    setInput(""); setError("");
    const optimistic: Message = { id: crypto.randomUUID(), role: "user", content, created_at: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: content })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The request failed");
      setMessages((current) => [
        ...current.filter((m) => m.id !== optimistic.id),
        { ...optimistic, created_at: data.userMessage.createdAt },
        { id: data.assistantMessage.id, role: "assistant", content: data.answer, sources: data.sources, created_at: data.assistantMessage.createdAt }
      ]);
      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      // Keep the optimistic user message visible; the server persists it before agent execution.
    } finally { setLoading(false); }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
      <div className="brand"><div className="brand-mark"><Sparkles size={18}/></div>{sidebarOpen && <div><strong>RecallAI</strong><small>Search with memory</small></div>}</div>
      <button className="new-chat" onClick={() => newConversation()}><Plus size={17}/>{sidebarOpen && "New conversation"}</button>
      {sidebarOpen && <>
        <div className="side-label">RECENT</div>
        <div className="conversation-list">
          {conversations.map((c) => <button key={c.id} className={`conversation ${activeId === c.id ? "active" : ""}`} onClick={() => openConversation(c.id)}>
            <span className="conversation-title">{c.title}</span><small>{c.last_message || "No messages yet"}</small>
          </button>)}
        </div>
        <div className="sidebar-foot"><span className="status-dot"/> One tool · Web search</div>
      </>}
      <button className="collapse" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">{sidebarOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</button>
    </aside>

    <main className="main">
      <header className="topbar"><div className="topbar-label"><span className="live-dot"/> Agent ready</div><div className="topbar-right"><Globe2 size={15}/> Web search enabled</div></header>
      <section className="chat-area">
        {messages.length === 0 ? <div className="welcome">
          <div className="welcome-icon"><Sparkles size={25}/></div>
          <p className="eyebrow">YOUR CONTEXT-AWARE SEARCH ASSISTANT</p>
          <h1>Ask anything.<br/><span>Pick up where you left off.</span></h1>
          <p className="welcome-copy">I search the web when freshness matters, cite my sources, and remember what we discussed in this conversation.</p>
          <div className="suggestions">
            {["What are the latest developments in AI agents?","Compare PostgreSQL and MongoDB for a new project","Explain how web search agents decide when to browse"].map((q) => <button key={q} onClick={() => setInput(q)}><Search size={15}/>{q}</button>)}
          </div>
        </div> : <div className="messages">
          {messages.map((m) => <article className={`message ${m.role}`} key={m.id}>
            <div className="avatar">{m.role === "assistant" ? <Sparkles size={16}/> : "A"}</div>
            <div className="message-body">
              <div className="message-meta"><strong>{m.role === "assistant" ? "RecallAI" : "You"}</strong><span><Clock3 size={12}/>{formatTime(m.created_at || m.createdAt)}</span></div>
              <div className="message-content">{renderText(m.content)}</div>
              {!!m.sources?.length && <div className="sources"><div className="sources-title"><Globe2 size={13}/> Sources</div>{m.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer"><span>{s.title}</span><small>{new URL(s.url).hostname}</small></a>)}</div>}
            </div>
          </article>)}
          {loading && <article className="message assistant"><div className="avatar"><Sparkles size={16}/></div><div className="message-body"><div className="message-meta"><strong>RecallAI</strong><span className="thinking">Thinking and checking sources…</span></div><div className="typing"><i/><i/><i/></div></div></article>}
          <div ref={bottomRef}/>
        </div>}
      </section>
      {error && <div className="error-banner">{error}</div>}
      <div className="composer-wrap">
        <form className="composer" onSubmit={sendMessage}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ask a question or continue a previous thought…" rows={1} />
          <button className="send" disabled={!input.trim() || loading} aria-label="Send message"><ArrowUp size={19}/></button>
        </form>
        <div className="composer-note">RecallAI can make mistakes. Check important information against the linked sources.</div>
      </div>
    </main>
  </div>;
}
