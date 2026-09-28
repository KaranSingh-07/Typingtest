import { useState } from 'react';
import type { Ack, AdminAction, AdminResult, AdminStats, AdminUser } from '../../../shared/protocol';
import { btnCls, inputCls } from '../components/ui';
import { getSocket } from '../lib/arena';

export function request(action: AdminAction): Promise<Ack<AdminStats | null> | null> {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket) return resolve(null);
    socket.timeout(8000).emit('admin', action, (err: unknown, res: Ack<AdminStats | null>) => resolve(err ? null : res));
  });
}

export type Send = (action: AdminAction) => Promise<AdminStats | null | void>;

export function DqButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="shrink-0 text-xs rounded-md border border-line px-2 py-0.5 text-error hover:border-error" onClick={onClick}>
      DQ
    </button>
  );
}

export function AnnouncementPanel({ current, send }: { current: string | null; send: Send }) {
  const [draft, setDraft] = useState('');
  return (
    <section className="rounded-2xl bg-surface border border-line p-5 flex flex-col gap-3">
      <h2 className="text-sub uppercase tracking-[0.2em] text-xs font-semibold">Announcement</h2>
      <p className="text-sub text-xs">Shown as a banner on every player page and on the projector until you clear it.</p>
      {current && (
        <div className="rounded-lg bg-main/15 text-main px-3 py-2 text-sm">
          Live now: <b>{current}</b>
        </div>
      )}
      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void send({ type: 'announce', message: draft });
          setDraft('');
        }}
      >
        <input
          className={inputCls}
          maxLength={160}
          placeholder="e.g. The final starts in 5 minutes. Grab a laptop!"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className={`${btnCls} bg-main text-bg shrink-0`} disabled={!draft.trim()}>
          Show banner
        </button>
        <button type="button" className={`${btnCls} bg-bg border border-line shrink-0`} disabled={!current} onClick={() => send({ type: 'announce', message: '' })}>
          Clear
        </button>
      </form>
    </section>
  );
}

export function PlayersPanel({ send }: { send: Send }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [scoresFor, setScoresFor] = useState<AdminUser | null>(null);
  const [scores, setScores] = useState<AdminResult[]>([]);

  const search = async () => {
    const data = await send({ type: 'findUsers', query });
    if (data?.users) setUsers(data.users);
  };
  const loadScores = async (u: AdminUser) => {
    setScoresFor(u);
    const data = await send({ type: 'userResults', userId: u.id });
    setScores(data?.results ?? []);
  };

  return (
    <section className="rounded-2xl bg-surface border border-line p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-sub uppercase tracking-[0.2em] text-xs font-semibold">Players</h2>
        <p className="text-sub text-xs mt-1">Fix a mistyped roll number or name, remove a player, or disqualify individual scores.</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input className={inputCls} placeholder="Search roll number, name or username" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className={`${btnCls} bg-bg border border-line shrink-0`}>Search</button>
      </form>

      {users && users.length === 0 && <div className="text-sub text-sm">No players match.</div>}
      {users && users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-sub text-xs uppercase tracking-wider text-left">
              <tr>
                <th className="py-2 pr-3 font-medium">Username</th>
                <th className="py-2 pr-3 font-medium">Roll</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium text-right">Best</th>
                <th className="py-2 pr-3 font-medium text-right">Final</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="py-2 pr-3 font-mono">
                    {u.username}
                    {u.hidden && <span className="text-sub text-xs"> (hidden)</span>}
                  </td>
                  <td className="py-2 pr-3 font-mono">{u.roll}</td>
                  <td className="py-2 pr-3">{u.name}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{u.best != null ? Math.round(u.best) : '–'}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{u.final != null ? Math.round(u.final) : '–'}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button className="text-xs text-sub hover:text-text px-1.5" onClick={() => setEditing(u)}>
                      edit
                    </button>
                    <button className="text-xs text-sub hover:text-text px-1.5" onClick={() => loadScores(u)}>
                      scores
                    </button>
                    <button
                      className="text-xs text-error px-1.5"
                      onClick={async () => {
                        if (!window.confirm(`Delete ${u.username} (${u.roll}) and all their scores? They'll have to register again.`)) return;
                        await send({ type: 'deleteUser', userId: u.id });
                        if (scoresFor?.id === u.id) setScoresFor(null);
                        void search();
                      }}
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditPlayer
          key={editing.id}
          user={editing}
          onCancel={() => setEditing(null)}
          onSave={async (roll, name, username) => {
            const data = await send({ type: 'updateUser', userId: editing.id, roll, name, username });
            if (data?.users) {
              setEditing(null);
              void search();
            }
          }}
        />
      )}

      {scoresFor && (
        <div className="rounded-xl bg-bg border border-line p-4">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm">
              Scores for <span className="font-mono">{scoresFor.username}</span>
            </div>
            <button className="text-xs text-sub hover:text-text" onClick={() => setScoresFor(null)}>
              close
            </button>
          </div>
          {scores.length === 0 ? (
            <div className="text-sub text-sm">No scores.</div>
          ) : (
            <ul className="text-sm font-mono space-y-1">
              {scores.map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="text-sub w-16">{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className={`w-28 ${r.kind === 'final' ? 'text-main' : 'text-sub'}`}>{r.kind.replace('_', ' ')}</span>
                  <span className="flex-1 tabular-nums">
                    {Math.round(r.wpm)} wpm · {Math.round(r.acc)}%{r.flag && <span className="text-error"> · {r.flag}</span>}
                  </span>
                  <DqButton
                    onClick={async () => {
                      if (!window.confirm(`Disqualify this ${Math.round(r.wpm)} wpm score? This deletes it.`)) return;
                      await send({ type: 'disqualify', resultId: r.id });
                      void loadScores(scoresFor);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function EditPlayer({
  user,
  onSave,
  onCancel,
}: {
  user: AdminUser;
  onSave: (roll: string, name: string, username: string) => void;
  onCancel: () => void;
}) {
  const [roll, setRoll] = useState(user.roll);
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  return (
    <form
      className="rounded-xl bg-bg border border-main/50 p-4 grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(roll, name, username);
      }}
    >
      <div className="sm:col-span-3 text-sm">
        Editing <span className="font-mono">{user.username}</span>. Their open pages reconnect automatically.
      </div>
      <input className={`${inputCls} font-mono uppercase`} value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="Roll number" />
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
      <input className={`${inputCls} font-mono`} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
      <div className="sm:col-span-3 flex gap-2">
        <button className={`${btnCls} bg-main text-bg`}>Save</button>
        <button type="button" className={`${btnCls} bg-surface border border-line`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
