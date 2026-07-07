import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import ContextMenu from '../components/ContextMenu.jsx';
import { useToast } from '../components/Toast.jsx';
import { useContextMenu } from '../lib/useContextMenu.js';
import { useLongPress } from '../lib/useLongPress.js';
import { api } from '../lib/api.js';

const PLACEHOLDER = 'https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg';

const AI_SUGGESTIONS = [
  'What are the current risks across my active cases?',
  'Summarize every case I am working on right now.',
  'Which patients have unresolved emergency alerts?',
  'Any cross-department treatment conflicts I should know about?',
];

const CONVERSATIONS = [
  {
    id: 'ai',
    name: 'AI Copilot',
    tag: '(All active cases)',
    icon: 'smart_toy',
    status: 'online',
    time: '',
    preview: 'Ask about any active case you’re working on.',
    messages: [],
  },
  {
    id: 'wilson',
    name: 'Dr. Abhigneya',
    role: 'Nephrology',
    avatar: PLACEHOLDER,
    status: 'online',
    time: '09:35 AM',
    preview: 'Good morning Dr. Abhigneya, could you review the latest creatinine trend?',
    messages: [
      { from: 'them', time: '09:15 AM', text: 'Good morning Dr. Abhigneya, could you review the latest creatinine trend?' },
      { from: 'them', time: '09:20 AM', text: 'Thanks. Should we be concerned about the ACE inhibitor increase?' },
      { from: 'me', time: '09:22 AM', text: "Yes, I'm concerned it may worsen renal function." },
    ],
  },
  {
    id: 'davis',
    name: 'Dr. Vivek',
    role: 'Dermatology',
    avatar: PLACEHOLDER,
    status: 'away',
    time: '09:20 AM',
    preview: "Sure, I've reviewed the labs. Creatinine increased from 1.6 to 2.1 in last 48h.",
    messages: [
      { from: 'them', time: '09:05 AM', text: 'Sure, I\'ve reviewed the labs. Creatinine increased from 1.6 to 2.1 in the last 48h.' },
    ],
  },
  {
    id: 'cto',
    name: 'CTO Channel',
    role: 'Team Channel',
    icon: 'group',
    time: 'Yesterday',
    preview: 'Thanks. Should we be concerned about the ACE inhibitor increase?',
    unread: 1,
    messages: [
      { from: 'them', time: 'Yesterday', text: 'Thanks. Should we be concerned about the ACE inhibitor increase?' },
    ],
  },
];

function Avatar({ conv, size = 10 }) {
  const dim = size === 8 ? 'w-8 h-8' : 'w-10 h-10';
  if (conv.icon) {
    return (
      <div className={`${dim} rounded-full bg-[#E0E0FF] flex items-center justify-center text-[#2304CF] font-bold shrink-0`}>
        <span className="material-symbols-outlined text-[20px]">{conv.icon}</span>
      </div>
    );
  }
  return (
    <img
      className={`${dim} rounded-full object-cover border border-slate-200 shrink-0`}
      src={conv.avatar}
      alt={conv.name}
    />
  );
}

export default function Messages() {
  const [activeId, setActiveId] = useState(CONVERSATIONS[1].id);
  const [tab, setTab] = useState('chats');
  const [draft, setDraft] = useState('');
  const [threads, setThreads] = useState(() =>
    Object.fromEntries(CONVERSATIONS.map((c) => [c.id, c.messages]))
  );

  const { showToast } = useToast();
  const { menu, openMenu, closeMenu } = useContextMenu();
  const [aiBusy, setAiBusy] = useState(false);

  const active = CONVERSATIONS.find((c) => c.id === activeId);
  const activeMessages = threads[activeId] || [];
  const isAiThread = activeId === 'ai';

  function nowTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function sendMessage(text) {
    const question = (text ?? draft).trim();
    if (!question) return;
    setThreads((t) => ({
      ...t,
      [activeId]: [...(t[activeId] || []), { from: 'me', time: nowTime(), text: question }],
    }));
    setDraft('');

    if (!isAiThread) return;

    setAiBusy(true);
    try {
      const r = await api.post('/ai/cases/ask', { question });
      setThreads((t) => ({
        ...t,
        ai: [...(t.ai || []), { from: 'them', time: nowTime(), text: r.answer, degraded: r.degraded }],
      }));
    } catch (e) {
      setThreads((t) => ({
        ...t,
        ai: [...(t.ai || []), { from: 'them', time: nowTime(), text: `Error: ${e.message}`, degraded: true }],
      }));
    } finally {
      setAiBusy(false);
    }
  }

  function saveMessageEdit(index, text) {
    setThreads((t) => ({
      ...t,
      [activeId]: t[activeId].map((m, i) => (i === index ? { ...m, text } : m)),
    }));
    showToast('Message updated.', 'success');
  }

  function deleteMessage(index) {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    setThreads((t) => ({
      ...t,
      [activeId]: t[activeId].filter((_, i) => i !== index),
    }));
    showToast('Message deleted.', 'success');
  }

  return (
    <Layout>
      <div className="flex-1 overflow-hidden px-6 md:px-8 pb-8">
        <div className="h-full flex rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden">
          {/* Conversations list */}
          <div className="w-80 shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/60">
            <div className="p-4 flex justify-between items-center">
              <h2 className="text-lg font-bold text-[#0F172A]">Messages</h2>
              <button
                type="button"
                className="bg-[#2304CF] text-white p-1.5 rounded-lg hover:bg-[#1c00a6] transition-colors"
                title="New message"
              >
                <span className="material-symbols-outlined text-[18px]">edit_square</span>
              </button>
            </div>
            <div className="px-4 mb-3">
              <div className="relative flex items-center bg-white rounded-lg border border-slate-200 focus-within:border-[#2304CF] transition-all">
                <span className="material-symbols-outlined text-slate-400 ml-3 mr-1.5 text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Search messages..."
                  className="w-full bg-transparent border-none text-sm text-slate-900 placeholder:text-slate-400 focus:ring-0 py-2 rounded-r-lg"
                />
              </div>
            </div>
            <div className="flex px-4 gap-4 mb-3 border-b border-slate-100">
              {['chats', 'channels'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={
                    tab === t
                      ? 'text-[#2304CF] text-xs font-bold pb-2 border-b-2 border-[#2304CF] capitalize'
                      : 'text-slate-500 text-xs font-bold pb-2 border-b-2 border-transparent hover:text-slate-900 capitalize transition-colors'
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
              <div className="flex flex-col gap-1">
                {CONVERSATIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`flex items-start gap-3 px-3 py-3 rounded-xl text-left relative transition-colors ${
                      activeId === c.id ? 'bg-white border border-slate-200 shadow-sm' : 'hover:bg-white/70'
                    }`}
                  >
                    <div className="relative mt-0.5">
                      <Avatar conv={c} />
                      {c.status && (
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            c.status === 'online' ? 'bg-emerald-500' : 'bg-amber-400'
                          }`}
                        ></div>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="text-sm text-slate-900 truncate font-bold">
                          {c.name} {c.tag && <span className="text-slate-500 font-normal">{c.tag}</span>}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-1">{c.time}</span>
                      </div>
                      {c.role && (
                        <span className="text-[#2304CF] text-[11px] font-medium block mb-0.5">{c.role}</span>
                      )}
                      <span className="text-slate-500 truncate block text-[13px]">{c.preview}</span>
                    </div>
                    {c.unread && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-[#2304CF] rounded-full text-white text-[10px] flex items-center justify-center font-bold">
                        {c.unread}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active thread */}
          <div className="flex-1 flex flex-col bg-white relative min-w-0">
            <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Avatar conv={active} />
                <div className="flex flex-col">
                  <span className="text-base font-semibold text-[#0F172A]">
                    {active.name} {active.tag && <span className="text-slate-500 font-normal text-sm">{active.tag}</span>}
                  </span>
                  {active.role && <span className="text-[#2304CF] text-xs font-medium">{active.role}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="text-slate-500 hover:text-[#2304CF] transition-colors p-2 rounded-full hover:bg-slate-100">
                  <span className="material-symbols-outlined">call</span>
                </button>
                <button type="button" className="text-slate-500 hover:text-[#2304CF] transition-colors p-2 rounded-full hover:bg-slate-100">
                  <span className="material-symbols-outlined">videocam</span>
                </button>
                <button type="button" className="text-slate-500 hover:text-[#2304CF] transition-colors p-2 rounded-full hover:bg-slate-100">
                  <span className="material-symbols-outlined">more_vert</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-5">
              {isAiThread && activeMessages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#E0E0FF] text-[#2304CF] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[28px]">auto_awesome</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Ask about any active case</p>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm">
                      Grounded in every active case your department is currently working on — allergies, treatments, orders, and discussion notes.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-w-md">
                    {AI_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendMessage(s)}
                        className="text-xs font-medium text-[#2304CF] bg-[#E0E0FF]/60 hover:bg-[#E0E0FF] rounded-full px-3 py-1.5 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-center my-1">
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                      Today
                    </span>
                  </div>
                  {activeMessages.map((m, i) => (
                    <MessageBubble
                      key={i}
                      m={m}
                      index={i}
                      active={active}
                      menu={menu}
                      openMenu={openMenu}
                      onSave={saveMessageEdit}
                      onDelete={deleteMessage}
                    />
                  ))}
                  {isAiThread && aiBusy && (
                    <div className="flex gap-3 max-w-2xl">
                      <div className="mt-1 shrink-0">
                        <Avatar conv={active} size={8} />
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm p-3.5 text-sm text-slate-500 animate-pulse">
                        Thinking…
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 shrink-0">
              <div className="bg-white border border-slate-200 rounded-xl focus-within:border-[#2304CF] shadow-sm transition-all flex flex-col overflow-hidden">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={isAiThread && aiBusy}
                  placeholder={isAiThread ? 'Ask anything about your active cases...' : 'Type a message...'}
                  spellCheck={false}
                  className="w-full bg-transparent border-none focus:ring-0 text-sm text-slate-900 p-4 resize-none h-14 placeholder:text-slate-400 disabled:opacity-60"
                />
                <div className="flex justify-between items-center px-2 pb-2">
                  <div className="flex gap-1 text-slate-500">
                    <button type="button" className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Attach">
                      <span className="material-symbols-outlined text-[20px]">attach_file</span>
                    </button>
                    <button type="button" className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Image">
                      <span className="material-symbols-outlined text-[20px]">image</span>
                    </button>
                    <button type="button" className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Emoji">
                      <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendMessage()}
                    disabled={isAiThread && (aiBusy || !draft.trim())}
                    className="bg-[#2304CF] hover:bg-[#1c00a6] text-white p-2 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px]">send</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </Layout>
  );
}

function MessageBubble({ m, index, active, menu, openMenu, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text);

  const isMine = m.from === 'me';
  const menuKey = `message-${index}`;
  const isSelected = menu?.id === menuKey;

  const menuItems = [
    {
      key: 'edit',
      label: 'Edit',
      icon: 'edit',
      disabled: !isMine,
      disabledReason: !isMine ? 'You can only edit your own messages.' : undefined,
      onClick: () => {
        setText(m.text);
        setEditing(true);
      },
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'delete',
      danger: true,
      disabled: !isMine,
      disabledReason: !isMine ? 'You can only delete your own messages.' : undefined,
      onClick: () => onDelete(index),
    },
  ];
  const longPress = useLongPress((e) => openMenu(e, menuKey, menuItems));

  function save() {
    if (!text.trim()) return;
    onSave(index, text.trim());
    setEditing(false);
  }

  if (isMine) {
    return (
      <div
        onContextMenu={(e) => openMenu(e, menuKey, menuItems)}
        {...longPress}
        className={`flex gap-3 max-w-2xl self-end flex-row-reverse rounded-xl -mx-1.5 px-1.5 py-1 ${isSelected ? 'bg-[#E0E0FF]/40' : ''}`}
      >
        <div className="flex flex-col gap-1 w-full items-end">
          <div className="flex items-baseline gap-2 flex-row-reverse">
            <span className="font-semibold text-slate-900 text-sm">You</span>
            <span className="text-[10px] text-slate-400">{m.time}</span>
          </div>
          {editing ? (
            <div className="w-full flex flex-col items-end gap-1.5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                autoFocus
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  className="px-3 py-1 rounded-lg text-xs font-semibold text-white bg-[#2304CF] hover:bg-[#1c03a6] transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#2304CF] text-white rounded-2xl rounded-tr-sm p-3.5 text-sm">
              {m.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={(e) => openMenu(e, menuKey, menuItems)}
      {...longPress}
      className={`flex gap-3 max-w-2xl rounded-xl -mx-1.5 px-1.5 py-1 ${isSelected ? 'bg-[#E0E0FF]/40' : ''}`}
    >
      <div className="mt-1 shrink-0">
        <Avatar conv={active} size={8} />
      </div>
      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-slate-900 text-sm">{active.name}</span>
          <span className="text-[10px] text-slate-400">{m.time}</span>
        </div>
        <div
          className={`rounded-2xl rounded-tl-sm p-3.5 text-sm whitespace-pre-line ${
            m.degraded
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-slate-50 border border-slate-100 text-slate-900'
          }`}
        >
          {m.text}
        </div>
      </div>
    </div>
  );
}
