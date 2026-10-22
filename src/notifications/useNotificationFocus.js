import { useEffect, useRef } from 'react';

export const DUTY_NOTIFICATION_FOCUS_TYPES = ['duty', 'duty_assigned', 'duty_chat'];
export const WORK_NOTIFICATION_FOCUS_TYPES = [
  'approval',
  'department_work',
  'personal_task',
  'completion_rejected',
  'work_assigned',
  'work_chat',
  'work_approved',
  'work_returned',
];

/**
 * Scrolls to and briefly highlights the element matching focusTarget.sourceId
 * via [data-focus-id]. Token changes re-trigger focus for the same id.
 * Retries briefly while the target view is still loading.
 */
export function useNotificationFocus(focusTarget, options = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!focusTarget?.sourceId || !focusTarget?.token) return undefined;

    const { acceptSourceTypes, onMatch } = optionsRef.current;
    if (acceptSourceTypes && !acceptSourceTypes.includes(focusTarget.sourceType)) {
      return undefined;
    }

    onMatch?.(focusTarget);

    let attempts = 0;
    let retryTimer;
    let clearHighlight;

    const tryFocus = () => {
      const id = String(focusTarget.sourceId);
      const el = document.querySelector(
        `[data-focus-id="${id}"], [data-chat-entity="${id}"], [data-document-id="${id}"]`,
      );
      if (!el) {
        if (attempts < 25) {
          attempts += 1;
          retryTimer = window.setTimeout(tryFocus, 120);
        }
        return;
      }
      el.classList.add('is-notification-focus');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      clearHighlight = window.setTimeout(() => {
        el.classList.remove('is-notification-focus');
      }, 2600);
    };

    const timer = window.setTimeout(tryFocus, 80);

    return () => {
      window.clearTimeout(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (clearHighlight) window.clearTimeout(clearHighlight);
    };
  }, [focusTarget?.token, focusTarget?.sourceId, focusTarget?.sourceType]);
}

export function menuForNotification(item) {
  if (item?.sourceType === 'work_chat' || item?.sourceType === 'duty_chat' || item?.sourceType === 'group_chat') {
    return 'chat';
  }
  return item?.kind === 'duty' ? 'duties' : 'work';
}
