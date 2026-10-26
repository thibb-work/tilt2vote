'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_OPTION_LEN, MAX_OPTIONS, MIN_OPTIONS, WEDGE_COLORS } from '@/lib/constants';

export function OptionsEditor({
  options,
  onClose,
}: {
  options: string[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(options);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function resize(count: number) {
    setDraft((current) => Array.from({ length: count }, (_, i) => current[i] ?? `Option ${i + 1}`));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (draft.some((label) => !label.trim())) {
      setError('Give every option a label.');
      return;
    }
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/host/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ options: draft.map((label) => label.trim()) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? 'Could not save. Try again.');
        return;
      }
      onClose();
    } catch {
      setError('Could not connect. Your edits are still here — try saving again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="editor"
      aria-labelledby="options-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}
    >
      <form onSubmit={save} aria-busy={busy}>
        <h2 id="options-title">Edit options</h2>
        <p className="editor-hint">The circle splits evenly between your options. Changes appear on every phone when you save.</p>
        <label className="editor-count" htmlFor="option-count">
          Number of options
          <select id="option-count" className="field" value={draft.length} disabled={busy}
            onChange={(event) => resize(Number(event.target.value))}>
            {Array.from({ length: MAX_OPTIONS - MIN_OPTIONS + 1 }, (_, i) => i + MIN_OPTIONS).map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>
        </label>
        {draft.map((value, i) => (
          <div key={i} className="editor-row">
            <span className="chip" style={{ background: WEDGE_COLORS[i], height: 28 }} />
            <input
              className="field"
              type="text"
              aria-label={`Option ${i + 1}`}
              value={value}
              required
              disabled={busy}
              maxLength={MAX_OPTION_LEN}
              onChange={(event) =>
                setDraft((current) => current.map((label, j) => (j === i ? event.target.value : label)))
              }
            />
            <button type="button" className="ctl editor-remove" aria-label={`Remove option ${i + 1}`}
              disabled={busy || draft.length <= MIN_OPTIONS}
              onClick={() => setDraft((current) => current.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="ctl" disabled={busy || draft.length >= MAX_OPTIONS}
          onClick={() => resize(draft.length + 1)}>
          Add option
        </button>
        {error && <div className="warn" role="alert">{error}</div>}
        <div className="editor-actions">
          <button type="button" className="ctl" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ctl is-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
