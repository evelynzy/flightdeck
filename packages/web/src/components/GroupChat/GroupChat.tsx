import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useGroupStore, groupKey } from '../../stores/groupStore';
import { MessageSquare, Send, Users, X } from 'lucide-react';
import type { ChatGroup, GroupMessage } from '../../types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function isHuman(msg: GroupMessage): boolean {
  return msg.fromAgentId === 'human' || msg.fromRole === 'Human User';
}

function isSystem(msg: GroupMessage): boolean {
  return msg.fromRole.toLowerCase().includes('system');
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function GroupChat(_props: { api: any; ws: any }) {
  const agents = useAppStore((s) => s.agents);
  const {
    groups,
    messages,
    selectedGroup,
    setGroups,
    setMessages,
    selectGroup,
    clearSelection,
  } = useGroupStore();

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [openTabs, setOpenTabs] = useState<Array<{ leadId: string; name: string }>>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const leads = agents.filter((a) => a.role.id === 'lead' && !a.parentId);

  /* ---- Fetch groups for every lead on mount ---- */
  useEffect(() => {
    if (leads.length === 0) return;
    let cancelled = false;

    async function fetchAllGroups() {
      const allGroups: ChatGroup[] = [];
      for (const lead of leads) {
        try {
          const res = await fetch(`/api/lead/${lead.id}/groups`);
          if (res.ok) {
            const data: ChatGroup[] = await res.json();
            allGroups.push(...data);
          }
        } catch { /* skip */ }
      }
      if (!cancelled) {
        setGroups(allGroups);
        // Auto-open all groups as tabs
        if (allGroups.length > 0) {
          const tabs = allGroups.map((g) => ({ leadId: g.leadId, name: g.name }));
          setOpenTabs(tabs);
          if (!selectedGroup) selectGroup(tabs[0].leadId, tabs[0].name);
        }
      }
    }

    void fetchAllGroups();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.map((l) => l.id).join(',')]);

  /* ---- Auto-open new groups as tabs ---- */
  useEffect(() => {
    const newTabs = groups
      .filter((g) => !openTabs.some((t) => t.leadId === g.leadId && t.name === g.name))
      .map((g) => ({ leadId: g.leadId, name: g.name }));
    if (newTabs.length > 0) {
      setOpenTabs((prev) => [...prev, ...newTabs]);
      if (!selectedGroup && newTabs.length > 0) {
        selectGroup(newTabs[0].leadId, newTabs[0].name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  /* ---- Fetch messages when selected tab changes ---- */
  useEffect(() => {
    if (!selectedGroup) return;
    let cancelled = false;

    async function fetchMessages() {
      const { leadId, name } = selectedGroup!;
      try {
        const res = await fetch(
          `/api/lead/${leadId}/groups/${encodeURIComponent(name)}/messages`,
        );
        if (res.ok) {
          const data: GroupMessage[] = await res.json();
          if (!cancelled) setMessages(groupKey(leadId, name), data);
        }
      } catch { /* skip */ }
    }

    void fetchMessages();
    // Clear unread for this tab
    const key = groupKey(selectedGroup.leadId, selectedGroup.name);
    setUnread((prev) => ({ ...prev, [key]: 0 }));

    return () => { cancelled = true; };
  }, [selectedGroup, setMessages]);

  /* ---- Track unread for non-active tabs ---- */
  const currentKey = selectedGroup ? groupKey(selectedGroup.leadId, selectedGroup.name) : null;
  const prevMsgCounts = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const [key, msgs] of Object.entries(messages)) {
      const prevCount = prevMsgCounts.current[key] ?? 0;
      if (msgs.length > prevCount && key !== currentKey) {
        setUnread((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + (msgs.length - prevCount) }));
      }
      prevMsgCounts.current[key] = msgs.length;
    }
  }, [messages, currentKey]);

  /* ---- Auto-scroll on new messages ---- */
  const currentMessages = selectedGroup
    ? messages[groupKey(selectedGroup.leadId, selectedGroup.name)] ?? []
    : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  /* ---- Agent name/icon resolvers ---- */
  const agentName = useCallback(
    (id: string): string => {
      if (id === 'human') return 'You';
      const agent = agents.find((a) => a.id === id);
      return agent?.role.name ?? id.slice(0, 8);
    },
    [agents],
  );

  const agentIcon = useCallback(
    (id: string): string => {
      if (id === 'human') return '👤';
      const agent = agents.find((a) => a.id === id);
      return agent?.role.icon ?? '🤖';
    },
    [agents],
  );

  /* ---- Tab management ---- */
  const switchTab = useCallback(
    (leadId: string, name: string) => {
      selectGroup(leadId, name);
      textareaRef.current?.focus();
    },
    [selectGroup],
  );

  const closeTab = useCallback(
    (leadId: string, name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenTabs((prev) => {
        const next = prev.filter((t) => !(t.leadId === leadId && t.name === name));
        // If closing the active tab, switch to neighbor
        if (selectedGroup?.leadId === leadId && selectedGroup?.name === name) {
          if (next.length > 0) {
            selectGroup(next[0].leadId, next[0].name);
          } else {
            clearSelection();
          }
        }
        return next;
      });
    },
    [selectedGroup, selectGroup, clearSelection],
  );

  /* ---- Send message ---- */
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !selectedGroup || sending) return;
    const { leadId, name } = selectedGroup;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await fetch(
        `/api/lead/${leadId}/groups/${encodeURIComponent(name)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        },
      );
    } catch { /* skip */ }
    finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [inputText, selectedGroup, sending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
  }, []);

  /* ---- Selected group metadata ---- */
  const selectedGroupData = selectedGroup
    ? groups.find((g) => g.name === selectedGroup.name && g.leadId === selectedGroup.leadId)
    : null;

  const memberNames = selectedGroupData
    ? selectedGroupData.memberIds.map((id) => agentName(id)).join(', ')
    : '';

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <div className="flex flex-col h-full bg-[#1a1a2e] text-gray-200">
      {/* ---- Tab bar ---- */}
      <div className="flex items-center border-b border-gray-700 shrink-0 overflow-x-auto bg-[#1a1a2e]">
        {openTabs.length === 0 ? (
          <div className="flex items-center gap-2 px-4 h-10 text-gray-500 text-sm">
            <MessageSquare className="w-4 h-4" />
            No group chats yet
          </div>
        ) : (
          openTabs.map((tab) => {
            const key = groupKey(tab.leadId, tab.name);
            const isActive =
              selectedGroup?.leadId === tab.leadId &&
              selectedGroup?.name === tab.name;
            const badge = unread[key] ?? 0;

            return (
              <button
                key={key}
                onClick={() => switchTab(tab.leadId, tab.name)}
                className={`group flex items-center gap-1.5 px-3 h-10 text-sm border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                  isActive
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="max-w-[120px] truncate">{tab.name}</span>
                {badge > 0 && (
                  <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                    {badge}
                  </span>
                )}
                <X
                  className="w-3 h-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1 shrink-0"
                  onClick={(e: React.MouseEvent) => closeTab(tab.leadId, tab.name, e)}
                />
              </button>
            );
          })
        )}

        {/* Group directory dropdown */}
        {groups.length > openTabs.length && (
          <div className="relative ml-auto px-2">
            <select
              className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-400 px-2 py-1 cursor-pointer"
              value=""
              onChange={(e) => {
                const [leadId, ...nameParts] = e.target.value.split(':');
                const name = nameParts.join(':');
                if (!openTabs.some((t) => t.leadId === leadId && t.name === name)) {
                  setOpenTabs((prev) => [...prev, { leadId, name }]);
                }
                switchTab(leadId, name);
              }}
            >
              <option value="" disabled>+ Open group…</option>
              {groups
                .filter((g) => !openTabs.some((t) => t.leadId === g.leadId && t.name === g.name))
                .map((g) => (
                  <option key={groupKey(g.leadId, g.name)} value={`${g.leadId}:${g.name}`}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* ---- Message area ---- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedGroup && selectedGroupData ? (
          <>
            {/* Group info header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700/50 shrink-0">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-500 truncate">
                {selectedGroupData.memberIds.length} members: {memberNames}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {currentMessages.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  No messages yet — start the conversation!
                </div>
              )}

              {currentMessages.map((msg) => {
                if (isSystem(msg)) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-xs text-gray-500 italic">{msg.content}</span>
                    </div>
                  );
                }

                const human = isHuman(msg);
                return (
                  <div key={msg.id} className={`flex ${human ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-2 max-w-[75%] ${human ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs shrink-0 mt-0.5">
                        {agentIcon(msg.fromAgentId)}
                      </div>
                      <div>
                        <div className={`text-xs font-bold mb-0.5 ${human ? 'text-right text-blue-400' : 'text-accent'}`}>
                          {agentName(msg.fromAgentId)}
                        </div>
                        <div className={`rounded-lg px-3 py-2 text-sm ${human ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                        <div className={`text-xs text-gray-500 mt-0.5 ${human ? 'text-right' : ''}`}>
                          {timeAgo(msg.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>

            {/* Compose bar */}
            <div className="border-t border-gray-700 p-3 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                  rows={1}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
                  style={{ maxHeight: 96 }}
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!inputText.trim() || sending}
                  className="p-2 bg-accent text-black rounded-lg hover:bg-accent-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
            <MessageSquare className="w-10 h-10" />
            <p className="text-sm">Select a group chat tab to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}
