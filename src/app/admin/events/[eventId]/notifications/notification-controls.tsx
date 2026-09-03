"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  authorizeBatchAction,
  createBatchAction,
  previewBatchAction,
  retryFailedAction,
  type NotificationActionResult,
} from "./actions";
import {
  DEFAULT_NOTIFICATION_BODY,
  DEFAULT_NOTIFICATION_SUBJECT,
} from "@/lib/email/templates/schedule-announcement";
import { AUDIENCE_OPTIONS } from "@/lib/notifications/types";

const initial: NotificationActionResult = { ok: false };

function Result({ state }: { state: NotificationActionResult }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-md px-3 py-2 text-sm ${
        state.error
          ? "border border-red-200 bg-red-50 text-red-800"
          : "border border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function ComposeBatch({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(createBatchAction, initial);
  return (
    <form action={action} className="space-y-4 rounded-lg border bg-white p-5 shadow-sm">
      <input type="hidden" name="eventId" value={eventId} />
      <div>
        <h2 className="font-semibold text-slate-900">1. Build an announcement</h2>
        <p className="mt-1 text-sm text-slate-500">
          Audience choices are server-side criteria. This form cannot submit addresses.
        </p>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Audience
        <select
          name="audienceKind"
          defaultValue="active_with_confirmed_assignments"
          className="mt-1 block w-full rounded-md border bg-white px-3 py-2"
        >
          {AUDIENCE_OPTIONS.map((option) => (
            <option key={option.kind} value={option.kind}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Subject
        <input
          name="subject"
          required
          maxLength={300}
          defaultValue={DEFAULT_NOTIFICATION_SUBJECT}
          className="mt-1 block w-full rounded-md border px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Message
        <textarea
          name="bodyTemplate"
          required
          maxLength={20_000}
          rows={12}
          defaultValue={DEFAULT_NOTIFICATION_BODY}
          className="mt-1 block w-full rounded-md border px-3 py-2 font-mono text-sm"
        />
      </label>
      <p className="text-xs text-slate-500">
        Available fields: {"{{first_name}}"}, {"{{last_name}}"}, {"{{full_name}}"},{" "}
        {"{{event_name}}"}, {"{{schedule}}"}, and {"{{portal_url}}"}.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function PreviewBatchButton(props: { eventId: string; batchId: string }) {
  const [state, action, pending] = useActionState(previewBatchAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={props.eventId} />
      <input type="hidden" name="batchId" value={props.batchId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Generating…" : "Generate fresh preview"}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function AuthorizeBatch(props: {
  eventId: string;
  batchId: string;
  previewRevision: number;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(authorizeBatchAction, initial);
  return (
    <form action={action} className="rounded-md border-2 border-amber-300 bg-amber-50 p-4">
      <input type="hidden" name="eventId" value={props.eventId} />
      <input type="hidden" name="batchId" value={props.batchId} />
      <input type="hidden" name="previewRevision" value={props.previewRevision} />
      <label className="flex items-start gap-2 text-sm font-medium text-amber-950">
        <input
          type="checkbox"
          name="confirmExactPreview"
          value="yes"
          required
          className="mt-1"
        />
        I authorize sending exactly preview revision {props.previewRevision} to the
        non-blocked recipients listed above.
      </label>
      <Button type="submit" className="mt-3" disabled={pending || props.disabled}>
        {pending ? "Sending…" : "Authorize and send exact preview"}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function RetryFailed(props: { eventId: string; batchId: string }) {
  const [state, action, pending] = useActionState(retryFailedAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={props.eventId} />
      <input type="hidden" name="batchId" value={props.batchId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Retrying…" : "Retry failed only"}
      </Button>
      <Result state={state} />
    </form>
  );
}
