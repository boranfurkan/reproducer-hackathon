'use client';

import { useState } from 'react';
import { Busy } from '../loaders';
import { ErrorNote, Eyebrow, Panel, buttonClass } from '../ui';
import type { RunView } from '@/lib/client';
import { replyToReporter } from '@/lib/hooks';

/** For a bug that could not be reproduced: a drafted comment for the issue, editable, posted only when the developer clicks. */
export default function ReplyDraft({ run, onChange }: { run: RunView; onChange: () => void }) {
  const [text, setText] = useState(run.replyDraft?.text ?? '');
  const [busy, setBusy] = useState<'draft' | 'post' | null>(null);
  const [error, setError] = useState('');
  const posted = run.replyDraft?.postedAt;

  async function draft() {
    setBusy('draft');
    setError('');
    try {
      setText((await replyToReporter(run._id, 'draft')).text ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function post() {
    setBusy('post');
    setError('');
    try {
      await replyToReporter(run._id, 'post', text);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="flex flex-col gap-3 px-[18px] py-4">
      <Eyebrow>Reply to the reporter</Eyebrow>
      {posted ? (
        <>
          <p className="text-sm text-pass">Posted on the issue{run.replyDraft?.url ? <> · <a href={run.replyDraft.url} target="_blank" rel="noreferrer">open comment</a></> : null}.</p>
          <p className="whitespace-pre-wrap rounded-md border border-purple-800 bg-ink px-3.5 py-3 text-sm text-muted">{run.replyDraft?.text}</p>
        </>
      ) : (
        <>
          <p className="text-[13px] text-subtle">A short comment for the issue that asks only for the details that would help. You edit it; nothing is posted until you click.</p>
          {text && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} aria-label="Reply to the reporter" className="resize-y rounded-md border border-purple-700 bg-ink p-3 text-sm leading-normal text-foreground outline-0 focus:border-purple-500" />}
          {error && <ErrorNote message={error} />}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={draft} disabled={busy !== null} className={buttonClass(text ? 'secondary' : 'primary', 'sm')}>{busy === 'draft' ? <Busy>Writing</Busy> : text ? 'Write it again' : 'Draft a reply'}</button>
            {text && <button onClick={post} disabled={busy !== null || text.trim().length < 10} className={buttonClass('primary', 'sm')}>{busy === 'post' ? <Busy>Posting</Busy> : `Post on #${run.issueNumber}`}</button>}
          </div>
        </>
      )}
    </Panel>
  );
}
